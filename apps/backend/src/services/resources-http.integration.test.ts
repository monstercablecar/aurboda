import express from 'express'
import { mkdtemp, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import supertest from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import type { AnyMiddleware } from '../typed-router.ts'
import type { CentralDb } from './central-db.ts'

import { createRolePool, withTransaction, type UserDb } from '../db/pool.ts'
import { createResourcesRouter } from '../routes/resources-router.ts'
import { getTestConnectionUri, getTestDbClient, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { createCentralDb } from './central-db.ts'
import { CREATE_RESOURCES_TABLES } from './central-resources.ts'
import { createResourcesService } from './resources.ts'

let pool: UserDb
let db: CentralDb
let storageRoot: string
let previousRoot: string | undefined
const auth: AnyMiddleware = (req, res, next) => {
  const user = req.headers.authorization?.replace('Bearer ', '')
  if (!user) {
    res.status(401).json({ success: false })
    return
  }
  req.user = user
  next()
}
const makeApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/resources', createResourcesRouter(auth, db, 'http://localhost'))
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
  return app
}
beforeAll(async () => {
  await startTestDb()
  previousRoot = process.env.RESOURCES_STORAGE_DIR
  storageRoot = await mkdtemp(join(tmpdir(), 'resources-http-'))
  process.env.RESOURCES_STORAGE_DIR = storageRoot
  pool = createRolePool({ connectionString: getTestConnectionUri(), max: 5 })
  const client = getTestDbClient()
  await client.query('CREATE TABLE admins(username TEXT PRIMARY KEY)')
  await client.query(CREATE_RESOURCES_TABLES)
  db = createCentralDb({ getClient: async () => pool, withTransaction: (fn) => withTransaction(pool, fn) })
}, 120000)
afterAll(async () => {
  await pool?.end()
  await stopTestDb()
  if (previousRoot === undefined) delete process.env.RESOURCES_STORAGE_DIR
  else process.env.RESOURCES_STORAGE_DIR = previousRoot
  await rm(storageRoot, { recursive: true, force: true })
})
beforeEach(async () => {
  await pool.query(
    'TRUNCATE resources_items, resources_folders, resources_pending_uploads, resources_pending_deletions, admins',
  )
  await pool.query("INSERT INTO admins VALUES('admin')")
})

test('video suffix, open-ended and invalid ranges; original download name and authenticated HEAD', async () => {
  const app = makeApp()
  const bytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(32)])
  const upload = await supertest(app)
    .post('/resources/upload')
    .set('Authorization', 'Bearer admin')
    .field('title', 'Video')
    .field('description', 'Transport fixture')
    .field('parent_id', '')
    .attach('file', bytes, { filename: 'practice.mp4', contentType: 'video/mp4' })
    .expect(201)
  const url = `/resources/items/${upload.body.data.id}/content`
  const suffix = await supertest(app)
    .get(url)
    .set('Authorization', 'Bearer reader')
    .set('Range', 'bytes=-8')
    .expect(206)
  expect(suffix.headers['content-range']).toBe(
    `bytes ${bytes.length - 8}-${bytes.length - 1}/${bytes.length}`,
  )
  expect(suffix.headers['content-length']).toBe('8')
  const open = await supertest(app)
    .get(url)
    .set('Authorization', 'Bearer reader')
    .set('Range', 'bytes=8-')
    .expect(206)
  expect(open.headers['content-length']).toBe(String(bytes.length - 8))
  await supertest(app)
    .get(url)
    .set('Authorization', 'Bearer reader')
    .set('Range', 'bytes=999999-')
    .expect(416)
  const download = await supertest(app)
    .get(url + '?download=1')
    .set('Authorization', 'Bearer reader')
    .expect(200)
  expect(download.headers['content-disposition']).toContain('attachment;')
  expect(download.headers['content-disposition']).toContain('practice.mp4')
  expect(download.headers['cache-control']).toBe('private, no-store')
  expect(download.headers['x-content-type-options']).toBe('nosniff')
  await supertest(app).head(url).expect(401)
  await supertest(app).head(url).set('Authorization', 'Bearer reader').expect(200)
})

test('rejects an oversized HTTP upload without publishing metadata', async () => {
  const previous = process.env.RESOURCES_MAX_UPLOAD_BYTES
  process.env.RESOURCES_MAX_UPLOAD_BYTES = '8'
  try {
    const app = makeApp()
    await supertest(app)
      .post('/resources/upload')
      .set('Authorization', 'Bearer admin')
      .field('title', 'Too large')
      .attach('file', Buffer.from('%PDF-1.7\nmore than eight bytes'), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      })
      .expect(413)
    expect((await createResourcesService(db).list('reader')).resources).toHaveLength(0)
    await pool.query("UPDATE resources_pending_uploads SET created_at=now()-interval '25 hours'")
    await createResourcesService(db).cleanup()
    expect((await pool.query('SELECT * FROM resources_pending_uploads')).rows).toHaveLength(0)
  } finally {
    if (previous === undefined) delete process.env.RESOURCES_MAX_UPLOAD_BYTES
    else process.env.RESOURCES_MAX_UPLOAD_BYTES = previous
  }
})

test('interrupted multipart upload remains tracked and is reclaimed without metadata', async () => {
  const app = makeApp()
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server port')
  const boundary = 'resource-interrupted-boundary'
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/resources/upload',
    method: 'POST',
    headers: { Authorization: 'Bearer admin', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  })
  req.on('error', () => {})
  try {
    req.write(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="interrupted.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n`,
    )
    let reserved = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await pool.query('SELECT * FROM resources_pending_uploads')).rows.length) {
        reserved = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(reserved).toBe(true)
    req.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect((await createResourcesService(db).list('reader')).resources).toHaveLength(0)
    await pool.query("UPDATE resources_pending_uploads SET created_at=now()-interval '25 hours'")
    await createResourcesService(db).cleanup()
    expect((await pool.query('SELECT * FROM resources_pending_uploads')).rows).toHaveLength(0)
  } finally {
    req.destroy()
    server.closeAllConnections()
    server.close()
  }
}, 10000)

test('preserves Unicode original filenames for download', async () => {
  const app = makeApp()
  const upload = await supertest(app)
    .post('/resources/upload')
    .set('Authorization', 'Bearer admin')
    .field('title', 'Café notes')
    .attach('file', Buffer.from('%PDF-1.7\nnotes'), { filename: 'café.pdf', contentType: 'application/pdf' })
    .expect(201)
  expect(upload.body.data.original_filename).toBe('café.pdf')
  const download = await supertest(app)
    .head(`/resources/items/${upload.body.data.id}/content?download=1`)
    .set('Authorization', 'Bearer reader')
    .expect(200)
  expect(download.headers['content-disposition']).toContain('caf%C3%A9.pdf')
})
