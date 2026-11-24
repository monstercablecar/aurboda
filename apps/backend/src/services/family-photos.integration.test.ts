import express from 'express'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import supertest from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'

import type { AnyMiddleware } from '../typed-router.ts'
import type { CentralDb } from './central-db.ts'

import { createRolePool, withTransaction, type UserDb } from '../db/pool.ts'
import { createFamilyPhotosRouter, familyErrorHandler } from '../routes/family-photos-router.ts'
import { getTestConnectionUri, getTestDbClient, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { createCentralDb } from './central-db.ts'
import { CREATE_FAMILY_TABLES, createFamilyService } from './family-photos.ts'
import { familyMaxDerivative, familyMaxUpload, familyPath, familyWorkspace } from './family-storage.ts'

let pool: UserDb
let db: CentralDb
let root: string
let image: Buffer
let video: Buffer
const captured = vi.fn()
const auth: AnyMiddleware = (req, res, next) => {
  const username = req.headers.authorization?.replace('Bearer ', '')
  if (!username) {
    res.status(401).json({ success: false })
    return
  }
  req.user = username
  next()
}
const makeApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/family-photos', createFamilyPhotosRouter(auth, db, 'http://localhost', { startWorker: false }))
  app.use('/family-photos', familyErrorHandler)
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    captured(error)
    res.status(500).json({ success: false })
  })
  return app
}
const upload = (
  app: ReturnType<typeof makeApp>,
  bytes = image,
  filename = 'photo.jpg',
  mime = 'image/jpeg',
  user = 'admin',
) =>
  supertest(app)
    .post('/family-photos/upload')
    .set('Authorization', `Bearer ${user}`)
    .field('caption', 'A private family memory')
    .attach('file', bytes, { filename, contentType: mime })
const media = (id: string, variant = 'preview') => `/family-photos/media/${id}/${variant}`
beforeAll(async () => {
  vi.stubEnv('FAMILY_PHOTOS_ENABLED', 'true')
  root = await mkdtemp(join(tmpdir(), 'family-http-'))
  vi.stubEnv('FAMILY_STORAGE_DIR', root)
  vi.stubEnv('FAMILY_MIN_FREE_BYTES', '1')
  await startTestDb()
  pool = createRolePool({ connectionString: getTestConnectionUri(), max: 6 })
  const client = getTestDbClient()
  await client.query(
    "CREATE TABLE admins(username TEXT PRIMARY KEY); CREATE TABLE user_accounts(username TEXT PRIMARY KEY,plan TEXT DEFAULT 'exempt'); CREATE TABLE deleted_usernames(username TEXT PRIMARY KEY)",
  )
  await client.query(CREATE_FAMILY_TABLES)
  await client.query(CREATE_FAMILY_TABLES)
  db = createCentralDb({ getClient: async () => pool, withTransaction: (fn) => withTransaction(pool, fn) })
  image = await sharp({ create: { width: 40, height: 24, channels: 3, background: '#8373ab' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const fixture = join(root, 'fixture.mp4')
  execFileSync('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=160x120:d=2',
    '-c:v',
    'libx264',
    '-threads',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-metadata',
    'location=+40.00-105.00/',
    '-metadata',
    'creation_time=2026-01-02T03:04:05Z',
    '-y',
    fixture,
  ])
  video = await readFile(fixture)
  await rm(fixture)
}, 120_000)
afterAll(async () => {
  await pool?.end()
  await stopTestDb()
  await rm(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
}, 120_000)
beforeEach(async () => {
  captured.mockClear()
  process.env.FAMILY_PHOTOS_ENABLED = 'true'
  delete process.env.FAMILY_QUOTA_BYTES
  delete process.env.FAMILY_MAX_UPLOAD_BYTES
  delete process.env.FAMILY_ALLOW_MEMBER_ORIGINALS
  await pool.query(
    "TRUNCATE family_media,family_folders,family_uploads,admins,user_accounts,deleted_usernames; INSERT INTO user_accounts(username) VALUES('admin'),('family'),('family2'),('regular'); INSERT INTO admins VALUES('admin'); UPDATE user_accounts SET family_member=true WHERE username IN ('family','family2')",
  )
  for (const name of await readdir(root)) await rm(join(root, name), { recursive: true, force: true })
})
test('default false, admin-only independent designation, live role changes and no plan modification', async () => {
  const app = makeApp()
  await supertest(app).get('/family-photos').expect(401)
  await supertest(app).get('/family-photos').set('Authorization', 'Bearer regular').expect(403)
  await supertest(app)
    .patch('/family-photos/members/regular')
    .set('Authorization', 'Bearer family')
    .send({ family_member: true })
    .expect(403)
  await supertest(app)
    .patch('/family-photos/members/regular')
    .set('Authorization', 'Bearer admin')
    .send({ family_member: true })
    .expect(200)
  expect((await pool.query("SELECT * FROM user_accounts WHERE username='regular'")).rows[0]).toMatchObject({
    family_member: true,
    plan: 'exempt',
  })
  expect((await pool.query("SELECT * FROM admins WHERE username='regular'")).rowCount).toBe(0)
  await supertest(app).get('/family-photos').set('Authorization', 'Bearer regular').expect(200)
  await supertest(app)
    .patch('/family-photos/members/regular')
    .set('Authorization', 'Bearer admin')
    .send({ family_member: false })
    .expect(200)
  await supertest(app).get('/family-photos').set('Authorization', 'Bearer regular').expect(403)
})
test('photo processing preserves original and removes preview metadata; all derivative and range requests recheck current membership', async () => {
  const app = makeApp()
  const result = await upload(app).expect(201)
  const id = result.body.data.id
  await createFamilyService(db).tick()
  expect((await pool.query('SELECT status FROM family_media WHERE id=$1', [id])).rows[0].status).toBe('ready')
  expect(await readFile(await familyPath(id, 'original'))).toEqual(image)
  expect((await sharp(await readFile(await familyPath(id, 'preview.webp'))).metadata()).exif).toBeUndefined()
  for (const variant of ['preview', 'thumb', 'download']) {
    const url = media(id, variant)
    const anon = await supertest(app).get(url).set('Range', 'bytes=0-7').expect(401)
    expect(anon.headers['cache-control']).toBe('private, no-store')
    await supertest(app).get(url).set('Authorization', 'Bearer regular').expect(403)
    const response = await supertest(app)
      .get(url)
      .set('Authorization', 'Bearer family')
      .set('Range', 'bytes=0-7')
      .expect(206)
    expect(response.headers['content-length']).toBe('8')
    expect(response.headers['cache-control']).toBe('private, no-store')
    await supertest(app).head(url).set('Authorization', 'Bearer family').expect(200)
    await supertest(app)
      .get(url)
      .set('Authorization', 'Bearer family')
      .set('Range', 'bytes=99999999-')
      .expect(416)
    const fresh = await supertest(app)
      .get(url)
      .set('Authorization', 'Bearer family')
      .set('If-Modified-Since', new Date().toUTCString())
      .set('If-None-Match', '*')
      .expect(200)
    expect(fresh.headers.etag).toBeUndefined()
  }
  await pool.query("UPDATE user_accounts SET family_member=false WHERE username='family'")
  await supertest(app).get(media(id)).set('Authorization', 'Bearer family').expect(403)
  await supertest(app).get(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(403)
  await supertest(app).get(media(id, 'original')).set('Authorization', 'Bearer admin').expect(200)
  expect(captured).not.toHaveBeenCalled()
}, 30_000)
test('scoped cookies permit seeking, reject stale identity and revocation; originals require bearer and live admin', async () => {
  const app = makeApp()
  const result = await upload(app).expect(201)
  const id = result.body.data.id
  await createFamilyService(db).tick()
  const binding = 'a'.repeat(32)
  const response = await supertest(app)
    .post('/family-photos/session')
    .set('Authorization', 'Bearer admin')
    .set('Cookie', `aurboda_family_identity=${binding}`)
    .set('X-Family-Identity', binding)
    .expect(200)
  const cookie = response.headers['set-cookie'][0].split(';')[0]
  const cookies = `${cookie}; aurboda_family_identity=${binding}`
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly')
  expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict')
  await supertest(app).get(media(id)).set('Cookie', cookies).set('Range', 'bytes=-8').expect(206)
  await supertest(app)
    .get(media(id, 'original'))
    .set('Cookie', cookies)
    .set('X-Family-Original', '1')
    .expect(403)
  await supertest(app)
    .get(media(id))
    .set('Cookie', `${cookie}; aurboda_family_identity=${'b'.repeat(32)}`)
    .expect(401)
  await pool.query("DELETE FROM admins WHERE username='admin'")
  await supertest(app).get(media(id)).set('Cookie', cookies).expect(403)
  await supertest(app).get(media(id, 'original')).set('Authorization', 'Bearer family').expect(403)
  process.env.FAMILY_ALLOW_MEMBER_ORIGINALS = 'true'
  await supertest(app).get(media(id, 'original')).set('Authorization', 'Bearer family').expect(200)
  await supertest(app).delete('/family-photos/session').set('Cookie', cookies).expect(200)
  await supertest(app).get(media(id)).set('Cookie', cookies).expect(401)
}, 30_000)
test('real video derivative supports range playback and strips location; no token-bearing media URLs', async () => {
  const app = makeApp()
  const result = await upload(app, video, 'phone.mov', 'video/quicktime').expect(201)
  const id = result.body.data.id
  await createFamilyService(db).tick()
  expect((await pool.query('SELECT status FROM family_media WHERE id=$1', [id])).rows[0].status).toBe('ready')
  const preview = await familyPath(id, 'preview.mp4')
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', preview],
    { encoding: 'utf8' },
  )
  expect(probe).not.toMatch(/"(?:location|location-eng|com\.apple\.quicktime\.location[^"]*)"|105\.00|40\.00/)
  const response = await supertest(app)
    .get(media(id))
    .set('Authorization', 'Bearer family')
    .set('Range', 'bytes=100-199')
    .expect(206)
  expect(response.headers['content-type']).toBe('video/mp4')
  expect(response.headers['content-length']).toBe('100')
  expect(JSON.stringify(result.body)).not.toMatch(/token|\/public\/|authorization/i)
}, 30_000)
test('PNG, WebP, AVIF and real HEIC decode in the deployment runtime', async () => {
  const app = makeApp()
  const source = sharp(image)
  const heicInput = join(root, 'synthetic.png')
  const heicOutput = join(root, 'synthetic.heic')
  await source.clone().png().toFile(heicInput)
  execFileSync('heif-enc', ['-q', '70', '-o', heicOutput, heicInput], { stdio: 'pipe' })
  const fixtures = [
    { bytes: await source.clone().png().toBuffer(), name: 'phone.png', mime: 'image/png' },
    { bytes: await source.clone().webp().toBuffer(), name: 'phone.webp', mime: 'image/webp' },
    { bytes: await source.clone().avif().toBuffer(), name: 'phone.avif', mime: 'image/avif' },
    { bytes: await readFile(heicOutput), name: 'phone.heic', mime: 'image/heic' },
  ]
  for (const fixture of fixtures) {
    const response = await upload(app, fixture.bytes, fixture.name, fixture.mime).expect(201)
    await createFamilyService(db).tick()
    expect(
      (await pool.query('SELECT status FROM family_media WHERE id=$1', [response.body.data.id])).rows[0]
        .status,
      fixture.name,
    ).toBe('ready')
    const metadata = await sharp(
      await readFile(await familyPath(response.body.data.id, 'preview.webp')),
    ).metadata()
    expect(metadata.exif).toBeUndefined()
  }
}, 60_000)
test('members cannot modify others; administrator restore and uploader deletion preserve shared library', async () => {
  const app = makeApp()
  const result = await upload(app).expect(201)
  const id = result.body.data.id
  await createFamilyService(db).tick()
  await upload(app, image, 'photo.jpg', 'image/jpeg', 'regular').expect(403)
  await supertest(app)
    .patch(`/family-photos/items/${id}`)
    .set('Authorization', 'Bearer family')
    .send({ caption: 'forbidden' })
    .expect(403)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(403)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer admin').expect(200)
  await supertest(app).get(media(id)).set('Authorization', 'Bearer family').expect(404)
  await supertest(app)
    .post(`/family-photos/items/${id}/restore`)
    .set('Authorization', 'Bearer family')
    .expect(403)
  await supertest(app)
    .post(`/family-photos/items/${id}/restore`)
    .set('Authorization', 'Bearer admin')
    .expect(200)
  await pool.query(
    "INSERT INTO deleted_usernames VALUES('admin'); DELETE FROM user_accounts WHERE username='admin'",
  )
  await createFamilyService(db).tick()
  await supertest(app).get(media(id)).set('Authorization', 'Bearer family').expect(200)
  await supertest(app).get(media(id)).set('Authorization', 'Bearer admin').expect(403)
  expect(
    (await pool.query('SELECT created_by FROM family_media WHERE id=$1', [id])).rows[0].created_by,
  ).toBeNull()
}, 30_000)
test('duplicate hashes, traversal and MIME spoofing are rejected, and failed previews retain originals', async () => {
  const app = makeApp()
  const result = await upload(app, image, 'photo.jpg', 'image/jpeg', 'family').expect(201)
  const id = result.body.data.id
  await upload(app).expect(409)
  await upload(app, Buffer.from('<svg><script>unsafe</script></svg>'), 'fake.jpg').expect(415)
  await upload(app, image, 'fake.mp4', 'video/mp4').expect(415)
  await supertest(app).get(media('not-an-id')).set('Authorization', 'Bearer admin').expect(404)
  expect((await pool.query('SELECT * FROM family_uploads')).rowCount).toBe(0)
  await writeFile(await familyPath(id, 'original'), Buffer.from([255, 216, 255, 0]))
  await createFamilyService(db).tick()
  expect((await pool.query('SELECT status FROM family_media WHERE id=$1', [id])).rows[0].status).toBe(
    'failed',
  )
  await supertest(app).get(media(id, 'original')).set('Authorization', 'Bearer admin').expect(200)
  await supertest(app).get(media(id)).set('Authorization', 'Bearer family').expect(409)
  const ownFailed = await supertest(app)
    .get(`/family-photos/items/${id}`)
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(ownFailed.body.data).toMatchObject({ is_owner: true, status: 'failed' })
  await supertest(app).get(media(id)).set('Authorization', 'Bearer family2').expect(404)
  await supertest(app).get(`/family-photos/items/${id}`).set('Authorization', 'Bearer family2').expect(404)
  expect(captured).not.toHaveBeenCalled()
}, 30_000)
test('file limits, space/quota failures and concurrent reservations leave no published metadata', async () => {
  process.env.FAMILY_MAX_UPLOAD_BYTES = '8'
  await upload(makeApp()).expect(413)
  expect((await pool.query('SELECT * FROM family_uploads')).rowCount).toBe(0)
  delete process.env.FAMILY_MAX_UPLOAD_BYTES
  process.env.FAMILY_QUOTA_BYTES = '1'
  await upload(makeApp()).expect(507)
  const reserve = familyMaxUpload() + familyMaxDerivative() + familyWorkspace()
  process.env.FAMILY_QUOTA_BYTES = String(Math.floor(reserve * 1.5))
  const service = createFamilyService(db)
  const values = await Promise.allSettled([service.reserve('admin'), service.reserve('admin')])
  expect(values.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  for (const value of values) if (value.status === 'fulfilled') await service.cancel(value.value)
  delete process.env.FAMILY_QUOTA_BYTES
  process.env.FAMILY_MIN_FREE_BYTES = String(Number.MAX_SAFE_INTEGER)
  await upload(makeApp()).expect(507)
  process.env.FAMILY_MIN_FREE_BYTES = '1'
  expect((await pool.query('SELECT * FROM family_media')).rowCount).toBe(0)
})
test('durable queued files survive service recreation, cleanup retries tombstones and trash expires after 30 days', async () => {
  const first = makeApp()
  const result = await upload(first).expect(201)
  const id = result.body.data.id
  const second = makeApp()
  await createFamilyService(db).tick()
  await supertest(second).get(media(id)).set('Authorization', 'Bearer family').expect(200)
  await pool.query("UPDATE family_media SET deleted_at=now()-interval '31 days' WHERE id=$1", [id])
  await supertest(second)
    .post(`/family-photos/items/${id}/restore`)
    .set('Authorization', 'Bearer admin')
    .expect(409)
  await createFamilyService(db).tick()
  expect((await pool.query('SELECT * FROM family_media')).rowCount).toBe(0)
  expect(await readdir(root)).toHaveLength(0)
  const abandoned = randomUUID()
  await pool.query(
    "INSERT INTO family_uploads(id,reserved_bytes,created_at) VALUES($1,1,now()-interval '2 hours')",
    [abandoned],
  )
  await createFamilyService(db).tick()
  expect((await pool.query('SELECT * FROM family_uploads')).rowCount).toBe(0)
}, 30_000)
test('disabled flag refuses all routes; private failures stop before external reporting', async () => {
  const app = makeApp()
  await supertest(app)
    .post('/family-photos/session')
    .set('Authorization', 'Bearer family')
    .set('Origin', 'https://evil.example')
    .expect(403)
  await supertest(app)
    .patch('/family-photos/members/regular')
    .set('Authorization', 'Bearer admin')
    .send({ family_member: true, is_admin: true })
    .expect(400)
  await supertest(app)
    .patch('/family-photos/members/regular')
    .set('Content-Type', 'application/json')
    .send('{caption:private')
    .expect(400)
  process.env.FAMILY_PHOTOS_ENABLED = 'false'
  const response = await supertest(app).get('/family-photos').set('Authorization', 'Bearer admin').expect(404)
  expect(response.headers['cache-control']).toBe('private, no-store')
  expect(captured).not.toHaveBeenCalled()
})

test('private folders require current membership and administrators organize without touching originals', async () => {
  const app = makeApp()
  await supertest(app).get('/family-photos/folders').expect(401)
  await supertest(app).get('/family-photos/folders').set('Authorization', 'Bearer regular').expect(403)
  await supertest(app)
    .post('/family-photos/folders')
    .set('Authorization', 'Bearer family')
    .send({ name: 'Summer' })
    .expect(403)
  const created = await supertest(app)
    .post('/family-photos/folders')
    .set('Authorization', 'Bearer admin')
    .send({ name: ' Summer ' })
    .expect(201)
  const folder = created.body.folder.id
  expect(created.body.folder.name).toBe('Summer')
  await supertest(app)
    .post('/family-photos/folders')
    .set('Authorization', 'Bearer admin')
    .send({ name: 'summer' })
    .expect(409)
  await supertest(app)
    .post('/family-photos/folders')
    .set('Authorization', 'Bearer admin')
    .send({ name: '   ' })
    .expect(400)
  const uploaded = await upload(app).expect(201)
  const id = uploaded.body.data.id
  const move = { ids: [id], album_id: folder }
  await supertest(app)
    .patch('/family-photos/items/folder')
    .set('Authorization', 'Bearer family')
    .send(move)
    .expect(403)
  await supertest(app)
    .patch('/family-photos/items/folder')
    .set('Authorization', 'Bearer admin')
    .send(move)
    .expect(200)
  await supertest(app)
    .patch('/family-photos/items/folder')
    .set('Authorization', 'Bearer admin')
    .send({ ids: [id, randomUUID()], album_id: null })
    .expect(404)
  expect((await pool.query('SELECT album_id FROM family_media WHERE id=$1', [id])).rows[0].album_id).toBe(
    folder,
  )
  await createFamilyService(db).tick()
  const member = await supertest(app)
    .get('/family-photos/folders')
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(member.body.folders).toEqual([{ id: folder, name: 'Summer', count: 1 }])
  expect(member.headers['cache-control']).toBe('private, no-store')
  await pool.query("UPDATE user_accounts SET family_member=false WHERE username='family'")
  await supertest(app).get('/family-photos/folders').set('Authorization', 'Bearer family').expect(403)
  await supertest(app)
    .patch(`/family-photos/folders/${folder}`)
    .set('Authorization', 'Bearer admin')
    .send({ name: 'Summer days' })
    .expect(200)
  await supertest(app)
    .delete(`/family-photos/folders/${folder}`)
    .set('Authorization', 'Bearer admin')
    .expect(200)
  expect(
    (await pool.query('SELECT album_id,deleted_at FROM family_media WHERE id=$1', [id])).rows[0],
  ).toMatchObject({ album_id: null, deleted_at: null })
  expect(await readFile(await familyPath(id, 'original'))).toEqual(image)
}, 30000)
test('folder upload validates destination, pagination composes with inclusive taken/fallback dates and type', async () => {
  const app = makeApp()
  const folder = (await createFamilyService(db).folders.create('admin', 'Birthday')).id
  const result = await supertest(app)
    .post('/family-photos/upload')
    .set('Authorization', 'Bearer admin')
    .field('caption', 'Birthday')
    .field('album_id', folder)
    .attach('file', image, { filename: 'photo.jpg', contentType: 'image/jpeg' })
    .expect(201)
  expect(result.body.data.album_id).toBe(folder)
  await pool.query('DELETE FROM family_media WHERE id=$1', [result.body.data.id])
  await pool.query(
    `INSERT INTO family_media(id,sha256,kind,mime_type,source_format,original_filename,original_bytes,status,album_id,created_at,captured_at)
 SELECT id,lpad(i::text,64,'0'),'photo','image/jpeg','jpeg','test.jpg',1,'ready',$1,'2026-06-01T00:00:00Z','2026-01-02T12:00:00Z' FROM unnest($2::uuid[]) WITH ORDINALITY as t(id,i)`,
    [folder, Array.from({ length: 50 }, () => randomUUID())],
  )
  await pool.query(
    `INSERT INTO family_media(id,sha256,kind,mime_type,source_format,original_filename,original_bytes,status,created_at,captured_at) VALUES($1,$2,'photo','image/jpeg','jpeg','fallback.jpg',1,'ready','2026-01-02T23:59:59.999Z',null)`,
    [randomUUID(), 'f'.repeat(64)],
  )
  const query = { album_id: folder, from_date: '2026-01-02', to_date: '2026-01-02', kind: 'photo' }
  const first = await supertest(app)
    .get('/family-photos')
    .query(query)
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(first.body.items).toHaveLength(40)
  const second = await supertest(app)
    .get('/family-photos')
    .query({ ...query, cursor: first.body.next_cursor })
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(second.body.items).toHaveLength(10)
  expect(new Set([...first.body.items, ...second.body.items].map((row: { id: string }) => row.id)).size).toBe(
    50,
  )
  const unfiled = await supertest(app)
    .get('/family-photos')
    .query({ ...query, album_id: 'unfiled' })
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(unfiled.body.items).toHaveLength(1)
  expect(unfiled.body.items[0].original_filename).toBe('fallback.jpg')
  const none = await supertest(app)
    .get('/family-photos')
    .query({ ...query, from_date: '2026-01-03', to_date: '2026-01-03' })
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(none.body.items).toHaveLength(0)
  const localEvening = await supertest(app)
    .get('/family-photos')
    .query({
      album_id: 'unfiled',
      from_date: '2026-01-02',
      to_date: '2026-01-02',
      from_offset: 420,
      to_offset: 420,
    })
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(localEvening.body.items).toHaveLength(1)
  const localNextDay = await supertest(app)
    .get('/family-photos')
    .query({
      album_id: 'unfiled',
      from_date: '2026-01-03',
      to_date: '2026-01-03',
      from_offset: -120,
      to_offset: -120,
    })
    .set('Authorization', 'Bearer family')
    .expect(200)
  expect(localNextDay.body.items).toHaveLength(1)
  for (const dates of [
    { from_date: '2026-02-30' },
    { from_date: '2026-02-01', to_date: '2026-01-01' },
    { from_date: '0000-01-01' },
    { from_offset: 'bad' },
    { to_offset: '841' },
  ]) {
    await supertest(app).get('/family-photos').query(dates).set('Authorization', 'Bearer family').expect(400)
  }
  await supertest(app)
    .patch('/family-photos/items/folder')
    .set('Authorization', 'Bearer admin')
    .send({ ids: first.body.items.map((row: { id: string }) => row.id), album_id: randomUUID() })
    .expect(404)
  await supertest(app)
    .patch('/family-photos/items/folder')
    .set('Authorization', 'Bearer admin')
    .send({ ids: [first.body.items[0].id, first.body.items[0].id], album_id: null })
    .expect(400)
  await supertest(app)
    .patch('/family-photos/items/folder')
    .set('Authorization', 'Bearer admin')
    .send({ ids: Array.from({ length: 201 }, () => randomUUID()), album_id: null })
    .expect(400)
})

test('members upload with server ownership and remove only their own; moderation and originals stay protected', async () => {
  const app = makeApp()
  const service = createFamilyService(db)
  const folder = await service.folders.create('admin', 'Family days')
  const response = await supertest(app)
    .post('/family-photos/upload')
    .set('Authorization', 'Bearer family')
    .field('caption', 'Our day')
    .field('album_id', folder.id)
    .attach('file', image, { filename: 'our-day.jpg', contentType: 'image/jpeg' })
    .expect(201)
  const id = response.body.data.id
  expect(response.body.data.is_owner).toBe(true)
  expect(response.body.data.created_by).toBeUndefined()
  expect((await pool.query('SELECT created_by FROM family_media WHERE id=$1', [id])).rows[0].created_by).toBe(
    'family',
  )
  const own = await supertest(app).get('/family-photos').set('Authorization', 'Bearer family').expect(200)
  expect(own.body.items).toMatchObject([{ id, status: 'queued', is_owner: true }])
  const other = await supertest(app).get('/family-photos').set('Authorization', 'Bearer family2').expect(200)
  expect(other.body.items).toHaveLength(0)
  await supertest(app).get(`/family-photos/items/${id}`).set('Authorization', 'Bearer family2').expect(404)
  expect((await service.folders.list('family'))[0].count).toBe(1)
  expect((await service.folders.list('family2'))[0].count).toBe(0)
  await supertest(app)
    .post('/family-photos/upload')
    .set('Authorization', 'Bearer family')
    .field('caption', 'spoof')
    .field('created_by', 'family2')
    .attach('file', image, { filename: 'spoof.jpg', contentType: 'image/jpeg' })
    .expect(400)
  expect((await pool.query('SELECT count(*) FROM family_uploads')).rows[0].count).toBe('0')
  await supertest(app)
    .patch(`/family-photos/items/${id}`)
    .set('Authorization', 'Bearer family')
    .send({ caption: 'not granted', created_by: 'family2' })
    .expect(403)
  await supertest(app)
    .post(`/family-photos/items/${id}/retry`)
    .set('Authorization', 'Bearer family')
    .expect(403)
  await supertest(app)
    .post(`/family-photos/items/${id}/restore`)
    .set('Authorization', 'Bearer family')
    .expect(403)
  await service.tick()
  const detail = await supertest(app)
    .get(`/family-photos/items/${id}`)
    .set('Authorization', 'Bearer family2')
    .expect(200)
  expect(detail.body.data.is_owner).toBe(false)
  expect(detail.body.data.created_by).toBeUndefined()
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family2').expect(403)
  await supertest(app).get(media(id, 'original')).set('Authorization', 'Bearer family').expect(403)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(200)
  for (const variant of ['thumb', 'preview', 'download', 'original']) {
    await supertest(app).get(media(id, variant)).set('Authorization', 'Bearer family').expect(404)
    await supertest(app).head(media(id, variant)).set('Authorization', 'Bearer family').expect(404)
    await supertest(app)
      .get(media(id, variant))
      .set('Authorization', 'Bearer family')
      .set('Range', 'bytes=0-7')
      .expect(404)
  }
  await supertest(app).get(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(404)
  await supertest(app)
    .get('/family-photos')
    .query({ trash: 'true' })
    .set('Authorization', 'Bearer family')
    .expect(403)
  await supertest(app)
    .post(`/family-photos/items/${id}/restore`)
    .set('Authorization', 'Bearer family')
    .expect(403)
  await supertest(app).get(media(id, 'original')).set('Authorization', 'Bearer admin').expect(200)
  await supertest(app)
    .post(`/family-photos/items/${id}/restore`)
    .set('Authorization', 'Bearer admin')
    .expect(200)
  await pool.query('UPDATE family_media SET created_by=NULL WHERE id=$1', [id])
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(403)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer admin').expect(200)
  expect(await readFile(await familyPath(id, 'original'))).toEqual(image)
}, 30000)
async function waitForLock(pattern: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const waiting = await pool.query<{ count: string }>(
      "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",
      [pattern],
    )
    if (Number(waiting.rows[0].count) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Expected the pending operation to wait on the test lock')
}
test('membership revoked during quota-lock waits blocks both upload reservation and final commit', async () => {
  const service = createFamilyService(db)
  for (const stage of ['reserve', 'finish']) {
    await pool.query("UPDATE user_accounts SET family_member=true WHERE username='family'")
    const id = stage === 'finish' ? await service.reserve('family') : undefined
    if (id) await writeFile(await familyPath(id, 'original'), image)
    const blocker = await pool.connect()
    await blocker.query('BEGIN')
    await blocker.query('SELECT pg_advisory_xact_lock(638294018)')
    const pending = (
      id ? service.finishUpload('family', id, 'mine.jpg', '', 'image/jpeg') : service.reserve('family')
    ).then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error }),
    )
    try {
      await waitForLock('%pg_advisory_xact_lock(638294018)%')
      await pool.query("UPDATE user_accounts SET family_member=false WHERE username='family'")
    } finally {
      await blocker.query('COMMIT')
      blocker.release()
    }
    expect((await pending).error).toMatchObject({ status: 403 })
    if (id) await service.cancel(id)
  }
  expect((await pool.query('SELECT count(*) FROM family_media')).rows[0].count).toBe('0')
  expect((await pool.query('SELECT count(*) FROM family_uploads')).rows[0].count).toBe('0')
}, 30000)
test('membership revoked during a row-lock wait prevents a queued own-photo removal', async () => {
  const app = makeApp()
  const uploaded = await upload(app, image, 'mine.jpg', 'image/jpeg', 'family').expect(201)
  const id = uploaded.body.data.id
  const blocker = await pool.connect()
  await blocker.query('BEGIN')
  await blocker.query('SELECT id FROM family_media WHERE id=$1 FOR UPDATE', [id])
  const pending = createFamilyService(db)
    .trash('family', id)
    .then(
      () => undefined,
      (error) => error,
    )
  try {
    await waitForLock('%family_media%FOR UPDATE%')
    await pool.query("UPDATE user_accounts SET family_member=false WHERE username='family'")
  } finally {
    await blocker.query('COMMIT')
    blocker.release()
  }
  expect(await pending).toMatchObject({ status: 403 })
  expect(
    (await pool.query('SELECT deleted_at FROM family_media WHERE id=$1', [id])).rows[0].deleted_at,
  ).toBeNull()
  await upload(app, image, 'denied.jpg', 'image/jpeg', 'family').expect(403)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(403)
}, 30000)
test('permanently deleted uploader accounts cannot claim ownership; shared uploads survive', async () => {
  const app = makeApp()
  const id = (await upload(app, image, 'mine.jpg', 'image/jpeg', 'family').expect(201)).body.data.id
  await pool.query(
    "INSERT INTO deleted_usernames VALUES('family'); DELETE FROM user_accounts WHERE username='family'; INSERT INTO user_accounts(username,family_member) VALUES('family',true)",
  )
  await upload(app, image, 'denied.jpg', 'image/jpeg', 'family').expect(403)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family').expect(403)
  await createFamilyService(db).tick()
  expect(
    (await pool.query('SELECT created_by FROM family_media WHERE id=$1', [id])).rows[0].created_by,
  ).toBeNull()
  const result = await supertest(app)
    .get(`/family-photos/items/${id}`)
    .set('Authorization', 'Bearer family2')
    .expect(200)
  expect(result.body.data.is_owner).toBe(false)
  await supertest(app).delete(`/family-photos/items/${id}`).set('Authorization', 'Bearer family2').expect(403)
  expect(await readFile(await familyPath(id, 'original'))).toEqual(image)
}, 30000)
