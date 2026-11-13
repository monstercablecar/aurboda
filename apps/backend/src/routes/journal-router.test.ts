import { isAllowedWhenReadOnly } from '@aurboda/api-spec'
import express from 'express'
import supertest from 'supertest'
import { beforeEach, expect, test, vi } from 'vitest'

import * as service from '../services/journal.ts'
import { isMutatingMcpTool } from '../services/usage-channel.ts'
import { createJournalRouter } from './journal-router.ts'

vi.mock('../services/journal-catalog.ts', () => ({ JOURNAL_CATALOG: [] }))
vi.mock('../services/journal.ts', () => ({
  createJournalEntry: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' }),
  updateJournalEntry: vi.fn().mockResolvedValue({}),
  listJournalEntries: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  getJournalAttachment: vi.fn().mockResolvedValue({
    metadata: { filename: 'private audio.webm', mime_type: 'audio/webm' },
    bytes: Buffer.from([0, 128, 255, 13, 10]),
  }),
  addJournalAttachment: vi.fn().mockResolvedValue({}),
}))
vi.mock('../services/audit-log.ts', () => ({ auditWarn: vi.fn() }))

const id = '00000000-0000-4000-8000-000000000001'
const app = express()
app.use(express.json())
app.use(
  '/journal',
  createJournalRouter((req, res, next) => {
    if (req.headers.authorization !== 'Bearer accepted') {
      res.sendStatus(401)
      return
    }
    req.user = 'session-owner'
    next()
  }),
)
app.use(
  (
    error: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(error.status ?? 500).json({ success: false, error: error.message })
  },
)
beforeEach(() => vi.clearAllMocks())

test('journal requests authenticate and bind ownership only to the session', async () => {
  expect((await supertest(app).get('/journal/catalog')).status).toBe(401)
  expect(
    (await supertest(app).post('/journal/entries').set('Authorization', 'Bearer accepted').send({})).status,
  ).toBe(400)
  expect(
    (
      await supertest(app)
        .post('/journal/entries')
        .set('Authorization', 'Bearer accepted')
        .send({ occurred_at: '2026-11-13T10:00:00Z', user: 'someone-else' })
    ).status,
  ).toBe(201)
  expect(service.createJournalEntry).toHaveBeenCalledWith(
    'session-owner',
    expect.not.objectContaining({ user: 'someone-else' }),
  )
})

test('query coercion, PATCH omission, version and identifier validation', async () => {
  expect(
    (
      await supertest(app)
        .get('/journal/entries?page=2&per_page=10&area_id=general')
        .set('Authorization', 'Bearer accepted')
    ).status,
  ).toBe(200)
  expect(service.listJournalEntries).toHaveBeenCalledWith('session-owner', {
    page: 2,
    per_page: 10,
    area_id: 'general',
    deleted: 'false',
  })
  expect(
    (
      await supertest(app)
        .patch(`/journal/entries/${id}`)
        .set('Authorization', 'Bearer accepted')
        .send({ title: 'changed' })
    ).status,
  ).toBe(400)
  expect(
    (
      await supertest(app)
        .patch('/journal/entries/invalid')
        .set('Authorization', 'Bearer accepted')
        .send({ expected_updated_at: '2026-11-13T10:00:00Z' })
    ).status,
  ).toBe(400)
  const body = { expected_updated_at: '2026-11-13T10:00:00Z', title: 'changed' }
  expect(
    (await supertest(app).patch(`/journal/entries/${id}`).set('Authorization', 'Bearer accepted').send(body))
      .status,
  ).toBe(200)
  expect(service.updateJournalEntry).toHaveBeenCalledWith('session-owner', id, body)
})

test('attachment originals require current bearer auth and receive private binary headers', async () => {
  expect(
    (await supertest(app).get(`/journal/attachments/${id}`).set('Cookie', 'aurboda_resources=pretend'))
      .status,
  ).toBe(401)
  const response = await supertest(app)
    .get(`/journal/attachments/${id}`)
    .set('Authorization', 'Bearer accepted')
  expect(response.status).toBe(200)
  expect(response.headers['content-type']).toBe('audio/webm')
  expect(response.headers['content-length']).toBe('5')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.headers['cache-control']).toBe('private, no-store')
  expect(service.getJournalAttachment).toHaveBeenCalledWith('session-owner', id)
})

test('multipart upload preserves bytes and rejects oversized payloads', async () => {
  const bytes = Buffer.from([0, 128, 255, 13, 10])
  expect(
    (
      await supertest(app)
        .post(`/journal/entries/${id}/attachments`)
        .set('Authorization', 'Bearer accepted')
        .field('prompt_id', 'reflection')
        .attach('file', bytes, { filename: 'voice.webm', contentType: 'audio/webm' })
    ).status,
  ).toBe(201)
  expect(service.addJournalAttachment).toHaveBeenCalledWith('session-owner', id, {
    filename: 'voice.webm',
    mime_type: 'audio/webm',
    bytes,
    prompt_id: 'reflection',
  })
  vi.mocked(service.addJournalAttachment).mockClear()
  expect(
    (
      await supertest(app)
        .post(`/journal/entries/${id}/attachments`)
        .set('Authorization', 'Bearer accepted')
        .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1), {
          filename: 'large.webm',
          contentType: 'audio/webm',
        })
    ).status,
  ).toBe(413)
  expect(service.addJournalAttachment).not.toHaveBeenCalled()
})

test('journal mutation names and routes respect existing read-only gates', () => {
  for (const verb of ['create', 'update', 'delete']) {
    expect(isMutatingMcpTool(`${verb}_journal_entry`)).toBe(true)
    expect(isMutatingMcpTool(`${verb}_journal_area`)).toBe(true)
    expect(isMutatingMcpTool(`${verb}_journal_template`)).toBe(true)
  }
  expect(isMutatingMcpTool('delete_journal_attachment')).toBe(true)
  expect(isMutatingMcpTool('list_journal_entries')).toBe(false)
  expect(isAllowedWhenReadOnly('POST', '/journal/entries')).toBe(false)
  expect(isAllowedWhenReadOnly('PATCH', `/journal/entries/${id}`)).toBe(false)
  expect(isAllowedWhenReadOnly('DELETE', `/journal/attachments/${id}`)).toBe(false)
  expect(isAllowedWhenReadOnly('GET', `/journal/attachments/${id}`)).toBe(true)
})
