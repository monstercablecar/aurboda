import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import supertest from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import type { AnyMiddleware } from '../typed-router.ts'

import { createRolePool, withTransaction, type UserDb } from '../db/pool.ts'
import { createResourcesRouter } from '../routes/resources-router.ts'
import { getTestConnectionUri, getTestDbClient, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { createCentralDb } from './central-db.ts'
import { CREATE_RESOURCES_TABLES } from './central-resources.ts'
import { resourcePath } from './resources-storage.ts'
import { createResourcesService } from './resources.ts'
let pool: UserDb
let service: ReturnType<typeof createResourcesService>
let app: express.Express
let root: string
let revoked = false
beforeAll(async () => {
  await startTestDb()
  root = await mkdtemp(join(tmpdir(), 'resources-integration-'))
  process.env.RESOURCES_STORAGE_DIR = root
  pool = createRolePool({ connectionString: getTestConnectionUri(), max: 5 })
  const client = getTestDbClient()
  await client.query('CREATE TABLE admins(username TEXT PRIMARY KEY)')
  await client.query(CREATE_RESOURCES_TABLES)
  await client.query(CREATE_RESOURCES_TABLES)
  const db = createCentralDb({
    getClient: async () => pool,
    withTransaction: (fn) => withTransaction(pool, fn),
  })
  service = createResourcesService(db)
  const auth: AnyMiddleware = (req, res, next) => {
    const user = req.headers.authorization?.replace('Bearer ', '')
    if (!user || revoked) {
      res.status(401).json({ success: false })
      return
    }
    req.user = user
    next()
  }
  app = express()
  app.use(express.json())
  app.use('/api/resources', createResourcesRouter(auth, db, 'https://example.com/api'))
  app.use(
    (
      error: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.status ?? 500).json({ error: error.message })
    },
  )
}, 120000)
afterAll(async () => {
  await pool?.end()
  await stopTestDb()
  delete process.env.RESOURCES_STORAGE_DIR
  await rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  revoked = false
  await pool.query(
    'TRUNCATE resources_items, resources_folders, resources_pending_uploads, resources_pending_deletions, admins',
  )
  await pool.query("INSERT INTO admins VALUES('admin')")
})
test('shared metadata, live admin changes, duplicate titles and safe URL validation', async () => {
  const a = await service.createFolder('admin', { title: 'Shared' })
  const b = await service.createFolder('admin', { title: 'Shared' })
  expect(a.id).not.toBe(b.id)
  expect((await service.list('reader')).folders).toHaveLength(2)
  expect((await service.list('reader')).can_manage).toBe(false)
  await expect(service.createFolder('reader', { title: 'No' })).rejects.toMatchObject({ status: 403 })
  await pool.query("DELETE FROM admins WHERE username='admin'")
  await expect(service.updateFolder('admin', a.id, { title: 'No' })).rejects.toMatchObject({ status: 403 })
  await expect(
    service.createLink('reader', { title: 'Bad', external_url: 'javascript:alert(1)' }),
  ).rejects.toThrow()
})
test('nested folders prevent cycles, concurrent opposing moves, and require recursive confirmation', async () => {
  const a = await service.createFolder('admin', { title: 'A' })
  const b = await service.createFolder('admin', { title: 'B' })
  const results = await Promise.allSettled([
    service.updateFolder('admin', a.id, { parent_id: b.id }),
    service.updateFolder('admin', b.id, { parent_id: a.id }),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const folders = (await service.list('reader')).folders
  const parent = folders.find((f) => !f.parent_id)
  if (!parent) throw new Error('Expected root folder')
  await expect(service.deleteFolder('admin', parent.id)).rejects.toMatchObject({ status: 409 })
  await service.deleteFolder('admin', parent.id, true)
  expect((await service.list('reader')).folders).toEqual([])
})
test('optimistic metadata updates preserve omitted fields', async () => {
  const link = await service.createLink('admin', {
    title: 'Link',
    description: 'Keep',
    external_url: 'https://example.com',
  })
  await service.updateItem('admin', link.id, { title: 'Renamed', expected_updated_at: link.updated_at })
  await expect(
    service.updateItem('admin', link.id, { title: 'Stale', expected_updated_at: link.updated_at }),
  ).rejects.toMatchObject({ status: 409 })
  expect((await service.list('reader')).resources[0].description).toBe('Keep')
})
test('admin upload, reader list/range/HEAD, cookie prefix and revocation, missing file', async () => {
  await supertest(app).get('/api/resources').expect(401)
  await supertest(app)
    .post('/api/resources/upload')
    .set('Authorization', 'Bearer reader')
    .attach('file', Buffer.from('%PDF-1.7\nhello'), 'test.pdf')
    .expect(403)
  const upload = await supertest(app)
    .post('/api/resources/upload')
    .set('Authorization', 'Bearer admin')
    .field('title', 'PDF')
    .attach('file', Buffer.from('%PDF-1.7\nhello'), { filename: 'test.pdf', contentType: 'application/pdf' })
    .expect(201)
  const id = upload.body.data.id
  expect(
    (await supertest(app).get('/api/resources').set('Authorization', 'Bearer reader').expect(200)).body
      .resources[0].id,
  ).toBe(id)
  await supertest(app).get(`/api/resources/items/${id}/content`).expect(401)
  const range = await supertest(app)
    .get(`/api/resources/items/${id}/content`)
    .set('Authorization', 'Bearer reader')
    .set('Range', 'bytes=0-4')
    .expect(206)
  expect(range.headers['content-range']).toBe('bytes 0-4/14')
  const session = await supertest(app)
    .post('/api/resources/session')
    .set('Authorization', 'Bearer reader')
    .expect(200)
  const cookie = String(session.headers['set-cookie'][0])
  expect(cookie).toContain('Path=/api/resources')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).not.toContain('reader')
  await supertest(app)
    .head(`/api/resources/items/${id}/content`)
    .set('Cookie', cookie.split(';')[0])
    .expect(200)
  revoked = true
  await supertest(app)
    .get(`/api/resources/items/${id}/content`)
    .set('Cookie', cookie.split(';')[0])
    .expect(401)
  revoked = false
  await supertest(app).delete('/api/resources/session').set('Cookie', cookie.split(';')[0]).expect(200)
  await supertest(app)
    .get(`/api/resources/items/${id}/content`)
    .set('Cookie', cookie.split(';')[0])
    .expect(401)
  const file = await service.getFile(id)
  await rm(await resourcePath(file.key))
  await supertest(app)
    .get(`/api/resources/items/${id}/content`)
    .set('Authorization', 'Bearer reader')
    .expect(404)
})
test('invalid metadata and signatures clean files; durable stale uploads cleaned after restart equivalent', async () => {
  await supertest(app)
    .post('/api/resources/upload')
    .set('Authorization', 'Bearer admin')
    .field('title', '')
    .attach('file', Buffer.from('%PDF-1.7\nhello'), { filename: 'test.pdf', contentType: 'application/pdf' })
    .expect(400)
  await supertest(app)
    .post('/api/resources/upload')
    .set('Authorization', 'Bearer admin')
    .field('title', 'fake')
    .attach('file', Buffer.from('not a pdf'), { filename: 'test.pdf', contentType: 'application/pdf' })
    .expect(415)
  expect((await pool.query('SELECT * FROM resources_pending_uploads')).rows).toHaveLength(0)
  const key = randomUUID()
  await service.reserveUpload(key)
  await writeFile(await resourcePath(key), 'partial')
  await pool.query("UPDATE resources_pending_uploads SET created_at=now()-interval '25 hours'")
  await service.cleanup()
  expect((await pool.query('SELECT * FROM resources_pending_uploads')).rows).toHaveLength(0)
  await expect(import('node:fs/promises').then((fs) => fs.stat(join(root, key)))).rejects.toThrow()
})

test('all metadata mutation endpoints reject readers and anonymous uploads', async () => {
  const folder = await service.createFolder('admin', { title: 'Folder' })
  const link = await service.createLink('admin', { title: 'Link', external_url: 'https://example.com' })
  for (const [method, path, body] of [
    ['post', '/folders', { title: 'No' }],
    ['patch', `/folders/${folder.id}`, { title: 'No' }],
    ['delete', `/folders/${folder.id}`, {}],
    ['post', '/links', { title: 'No', external_url: 'https://example.com' }],
    ['patch', `/items/${link.id}`, { title: 'No' }],
    ['delete', `/items/${link.id}`, {}],
  ] as const)
    {await supertest(app)
      [method]('/api/resources' + path)
      .set('Authorization', 'Bearer reader')
      .send(body)
      .expect(403)}
  await supertest(app)
    .post('/api/resources/upload')
    .attach('file', Buffer.from('%PDF-1.7'), 'test.pdf')
    .expect(401)
})

test('a fresh service sees persistent uploaded bytes and failed deletion retries durably', async () => {
  const db = createCentralDb({
    getClient: async () => pool,
    withTransaction: (fn) => withTransaction(pool, fn),
  })
  const key = randomUUID()
  await service.reserveUpload(key)
  await writeFile(await resourcePath(key), '%PDF-1.7')
  const item = await service.addFile(
    'admin',
    { title: 'Persistent' },
    { key, name: 'test.pdf', mime: 'application/pdf', size: 8, kind: 'pdf' },
  )
  const fresh = createResourcesService(db)
  expect((await fresh.list('reader')).resources[0].id).toBe(item.id)
  expect((await fresh.getFile(item.id)).key).toBe(key)
  const fs = await import('node:fs/promises')
  expect((await fs.readFile(await resourcePath(key))).toString()).toBe('%PDF-1.7')
  // A directory in place of the file simulates a filesystem cleanup failure without relying on Unix permissions.
  await fs.unlink(await resourcePath(key))
  await fs.mkdir(await resourcePath(key))
  await fresh.deleteItem('admin', item.id)
  expect((await pool.query('SELECT * FROM resources_items')).rows).toHaveLength(0)
  expect((await pool.query('SELECT * FROM resources_pending_deletions')).rows).toHaveLength(1)
  await fs.rmdir(await resourcePath(key))
  await fresh.cleanup()
  expect((await pool.query('SELECT * FROM resources_pending_deletions')).rows).toHaveLength(0)
})
