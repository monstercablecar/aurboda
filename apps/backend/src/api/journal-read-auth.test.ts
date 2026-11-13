import express from 'express'
import request from 'supertest'
import { beforeEach, expect, test, vi } from 'vitest'

import type { CentralDb, OAuthToken } from '../services/central-db.ts'
import type { AnyMiddleware } from '../typed-router.ts'

import { createAuth } from '../auth.ts'
import { migrateSchemaIfNeeded } from '../db/index.ts'
import { httpError } from '../http-error.ts'
import { createJournalRouter } from '../routes/journal-router.ts'
import { createJournalReadAuth } from './journal-read-auth.ts'

vi.mock('../db/index.ts', () => ({ migrateSchemaIfNeeded: vi.fn(async () => {}) }))
vi.mock('../services/audit-log.ts', () => ({ auditWarn: vi.fn() }))
vi.mock('../services/journal.ts', () => ({
  getJournalEntry: vi.fn(async (user: string, id: string) => {
    if (id !== entryId || user !== 'alice') throw httpError(404, 'Journal entry not found.')
    return { id, content: 'Synthetic private reflection' }
  }),
  listJournalEntries: vi.fn(async (user: string) => ({
    data: user === 'alice' ? [{ id: entryId }] : [],
    total: user === 'alice' ? 1 : 0,
  })),
  getJournalAttachment: vi.fn(async (user: string, id: string) => {
    if (user !== 'alice' || id !== attachmentId) throw httpError(404, 'Journal attachment not found.')
    return { metadata: { filename: 'synthetic.webm', mime_type: 'audio/webm' }, bytes: media }
  }),
}))

const entryId = '00000000-0000-4000-8000-000000000001'
const attachmentId = '00000000-0000-4000-8000-000000000002'
const media = Buffer.alloc(1024 * 1024 + 17, 128)
const auth = createAuth('very very secretvery very secret')
const grants = new Map<string, OAuthToken>()
const centralDb = {
  getOAuthToken: async (token: string) => grants.get(token) ?? null,
  isUsernameDeleted: async (user: string) => user === 'deleted',
} as unknown as CentralDb
const accountAuth: AnyMiddleware = (req, _res, next) => {
  try {
    req.user = auth.getUsernameFromToken(req.headers.authorization?.slice(7) ?? '')
    next()
  } catch {
    next(httpError(401, 'Unauthorized'))
  }
}
const readAuth = createJournalReadAuth(accountAuth, centralDb)
const app = express()
app.use(express.json())
app.use('/journal', createJournalRouter(accountAuth, readAuth))
app.post('/reader-misuse', readAuth, (_req, res) => res.sendStatus(204))
app.use(
  (
    error: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.status ?? 500).json({ error: error.message }),
)
const grant = (user: string, scope = 'read') => {
  const token = `aur_at_synthetic_${user}`
  grants.set(token, {
    token,
    username: user,
    scope,
    token_type: 'access',
    client_id: 'fixture',
    revoked: false,
    expires_at: new Date(Date.now() + 3600000),
    parent_token: null,
    created_at: new Date(),
  })
  return token
}
beforeEach(() => {
  grants.clear()
  vi.clearAllMocks()
})

test('OAuth read grant downloads original media over 1 MiB without a full-access browser token', async () => {
  const response = await request(app)
    .get(`/journal/attachments/${attachmentId}?username=bob`)
    .set('Authorization', `Bearer ${grant('alice')}`)
    .buffer(true)
    .parse((incoming, done) => {
      const chunks: Buffer[] = []
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
      incoming.on('end', () => done(null, Buffer.concat(chunks)))
      incoming.on('error', done)
    })
  expect(response.status).toBe(200)
  expect(response.headers['cache-control']).toBe('private, no-store')
  expect(response.headers['content-length']).toBe(String(media.length))
  expect(response.body).toEqual(media)
  expect(migrateSchemaIfNeeded).toHaveBeenCalledWith('alice')
})

test.each(['bob', 'admin'])(
  'a %s token cannot list, read or download Alice records by supplying her username',
  async (user) => {
    const token = grant(user)
    const headers = { Authorization: `Bearer ${token}` }
    const list = await request(app).get('/journal/entries?username=alice&search=reflection').set(headers)
    expect(list.body).toEqual({ success: true, data: [], total: 0 })
    await request(app).get(`/journal/entries/${entryId}?user=alice`).set(headers).expect(404)
    await request(app).get(`/journal/attachments/${attachmentId}?user=alice`).set(headers).expect(404)
  },
)

test('revocation, expiry, deleted accounts and invalid scopes refuse journal REST reads', async () => {
  for (const kind of ['revoked', 'expired', 'deleted', 'scope']) {
    const token = grant(kind === 'deleted' ? 'deleted' : 'alice')
    const stored = grants.get(token)
    if (!stored) throw new Error('Missing synthetic grant')
    if (kind === 'revoked') stored.revoked = true
    if (kind === 'expired') stored.expires_at = new Date(0)
    if (kind === 'scope') stored.scope = 'write'
    await request(app)
      .get(`/journal/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
  }
  expect(migrateSchemaIfNeeded).not.toHaveBeenCalled()
})

test('OAuth reader does not authorize Journal writes and fails closed if reused for a write', async () => {
  const token = grant('alice')
  const headers = { Authorization: `Bearer ${token}` }
  await request(app)
    .post('/journal/entries')
    .set(headers)
    .send({ occurred_at: '2026-11-13T12:00:00Z' })
    .expect(401)
  await request(app)
    .patch(`/journal/entries/${entryId}`)
    .set(headers)
    .send({ expected_updated_at: '2026-11-13T12:00:00Z', title: 'changed' })
    .expect(401)
  await request(app)
    .delete(`/journal/entries/${entryId}`)
    .query({ expected_updated_at: '2026-11-13T12:00:00Z' })
    .set(headers)
    .expect(401)
  await request(app).post('/reader-misuse').set(headers).expect(403)
})

test('browser account tokens retain the existing own-account read path', async () => {
  await request(app)
    .get(`/journal/entries/${entryId}`)
    .set('Authorization', `Bearer ${auth.createToken('alice')}`)
    .expect(200)
})

test('schema failures refuse OAuth reads without returning database detail', async () => {
  vi.mocked(migrateSchemaIfNeeded).mockRejectedValueOnce(new Error('private database detail'))
  const response = await request(app)
    .get(`/journal/entries/${entryId}`)
    .set('Authorization', `Bearer ${grant('alice')}`)
  expect(response.status).toBe(503)
  expect(response.text).not.toContain('private database detail')
})
