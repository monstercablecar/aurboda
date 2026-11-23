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
    "TRUNCATE family_media,family_uploads,admins,user_accounts,deleted_usernames; INSERT INTO user_accounts(username) VALUES('admin'),('family'),('regular'); INSERT INTO admins VALUES('admin'); UPDATE user_accounts SET family_member=true WHERE username='family'",
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
test('family cannot mutate; administrator trash/restore and uploader deletion preserve shared library', async () => {
  const app = makeApp()
  const result = await upload(app).expect(201)
  const id = result.body.data.id
  await createFamilyService(db).tick()
  await upload(app, image, 'photo.jpg', 'image/jpeg', 'family').expect(403)
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
  const result = await upload(app).expect(201)
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
