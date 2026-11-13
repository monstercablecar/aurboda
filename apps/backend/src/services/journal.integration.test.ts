import { createJournalEntryBodySchema, journalEntriesQuerySchema } from '@aurboda/api-spec'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { _setDbForUser } from '../db/index.ts'
import { createRolePool } from '../db/pool.ts'
import { createTestDatabase, getTestUser, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { JOURNAL_CATALOG } from './journal-catalog.ts'
import * as journal from './journal.ts'

beforeAll(startTestDb)
afterAll(stopTestDb)
const user = getTestUser()
const body = (title = 'A private reflection') =>
  createJournalEntryBodySchema.parse({
    title,
    content: 'Unshared words',
    occurred_at: '2026-11-13T12:00:00Z',
  })
describe('private journal persistence', () => {
  it('guards revisions and idempotent creation; only hard deletes trashed entries', async () => {
    const input = body()
    const created = await journal.createJournalEntry(user, input)
    const retry = { ...input, id: created.id }
    // An idempotency key must be included in the original request.
    const first = await journal.createJournalEntry(user, { ...retry, id: crypto.randomUUID() })
    expect(await journal.createJournalEntry(user, { ...retry, id: first.id })).toEqual(first)
    await expect(
      journal.createJournalEntry(user, { ...retry, id: first.id, content: 'different' }),
    ).rejects.toMatchObject({ status: 409 })
    const updated = await journal.updateJournalEntry(user, created.id, {
      expected_updated_at: created.updated_at,
      title: 'Changed',
    })
    expect(updated.content).toBe(created.content)
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(Date.parse(created.updated_at))
    expect((await journal.listJournalRevisions(user, created.id))[0].snapshot).toEqual(created)
    await expect(
      journal.updateJournalEntry(user, created.id, {
        expected_updated_at: created.updated_at,
        title: 'stale',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(journal.deleteJournalEntry(user, created.id, updated.updated_at)).rejects.toMatchObject({
      status: 409,
    })
    const trashed = await journal.updateJournalEntry(user, created.id, {
      expected_updated_at: updated.updated_at,
      deleted: true,
    })
    await journal.deleteJournalEntry(user, created.id, trashed.updated_at)
    await expect(journal.getJournalEntry(user, created.id)).rejects.toMatchObject({ status: 404 })
  })
  it('retains archived assignments but revises entries atomically on area removal', async () => {
    const area = await journal.createJournalArea(user, {
      name: 'Temporary area',
      position: 20,
      archived: false,
    })
    const created = await journal.createJournalEntry(user, { ...body(), area_id: area.id })
    const archived = await journal.updateJournalArea(user, area.id, {
      expected_updated_at: area.updated_at,
      archived: true,
    })
    const changed = await journal.updateJournalEntry(user, created.id, {
      expected_updated_at: created.updated_at,
      title: 'Still assigned',
    })
    expect(changed.area_id).toBe(area.id)
    await expect(journal.createJournalEntry(user, { ...body(), area_id: area.id })).rejects.toMatchObject({
      status: 400,
    })
    await journal.deleteJournalArea(user, area.id, archived.updated_at)
    const detached = await journal.getJournalEntry(user, created.id)
    expect(detached.area_id).toBeNull()
    expect(detached.updated_at).not.toBe(changed.updated_at)
    expect((await journal.listJournalRevisions(user, created.id))[0].snapshot.area_id).toBe(area.id)
    expect((await journal.listJournalAreas(user)).some((a) => a.id === area.id)).toBe(false)
  })
  it('does not resurrect deleted defaults and guards template versions', async () => {
    const areas = await journal.listJournalAreas(user)
    expect(areas.some((area) => area.name === 'Mental health')).toBe(true)
    const removed = areas.find((area) => area.name === 'Mental health')
    if (!removed) throw new Error('Expected seeded area')
    await journal.deleteJournalArea(user, removed.id, removed.updated_at)
    expect((await journal.listJournalAreas(user)).some((area) => area.id === removed.id)).toBe(false)
    const template = await journal.createJournalTemplate(user, { title: 'Review', content: '# A prompt' })
    const created = await journal.createJournalEntry(user, { ...body(''), template_id: template.id })
    expect(created.content).toBe(template.content)
    expect(created.title).toBe(template.title)
    const updated = await journal.updateJournalTemplate(user, template.id, {
      expected_updated_at: template.updated_at,
      title: 'New title',
    })
    expect(updated.content).toBe(template.content)
    await expect(journal.deleteJournalTemplate(user, template.id, template.updated_at)).rejects.toMatchObject(
      { status: 409 },
    )
    await journal.deleteJournalTemplate(user, template.id, updated.updated_at)
    expect((await journal.getJournalEntry(user, created.id)).content).toBe(template.content)
  })
  it('snapshots catalog definitions and rejects arbitrary answers or replacement', async () => {
    const definition = JOURNAL_CATALOG[0]
    expect(definition).toBeDefined()
    const created = await journal.createJournalEntry(user, { ...body(), workbook_id: definition.id })
    expect(created.workbook?.definition).toEqual(definition)
    const workbook = created.workbook
    if (!workbook) throw new Error('Expected workbook')
    const prompt = definition.sections[0].prompts[0].id
    const updated = await journal.updateJournalEntry(user, created.id, {
      expected_updated_at: created.updated_at,
      workbook: { ...workbook, answers: { [prompt]: 'My answer' } },
    })
    await expect(
      journal.updateJournalEntry(user, created.id, {
        expected_updated_at: updated.updated_at,
        workbook: { ...workbook, answers: { not_a_prompt: 'bad' } },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      journal.updateJournalEntry(user, created.id, {
        expected_updated_at: updated.updated_at,
        workbook: null,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
  it('preserves binary bytes, validates attachment prompts and isolates another database', async () => {
    const created = await journal.createJournalEntry(user, { ...body(), tags: ['synthetic-secret'] })
    const bytes = Buffer.from([0, 255, 1, 128, 0, 10])
    const file = await journal.addJournalAttachment(user, created.id, {
      filename: '../private.png',
      mime_type: 'image/png',
      bytes,
    })
    expect(file.filename).toBe('private.png')
    expect((await journal.getJournalAttachment(user, file.id)).bytes).toEqual(bytes)
    await expect(
      journal.addJournalAttachment(user, created.id, {
        filename: 'bad.svg',
        mime_type: 'image/svg+xml',
        bytes,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      journal.addJournalAttachment(user, created.id, {
        filename: 'ok.png',
        mime_type: 'image/png',
        bytes,
        prompt_id: 'unknown',
      }),
    ).rejects.toMatchObject({ status: 400 })
    const other = await createTestDatabase(),
      pool = createRolePool({ connectionString: other.uri })
    _setDbForUser('journal-other', pool)
    try {
      const empty = await journal.listJournalEntries(
        'journal-other',
        journalEntriesQuerySchema.parse({ search: 'private', tag: 'synthetic-secret' }),
      )
      expect(empty).toEqual({ data: [], total: 0 })
      expect(await journal.listJournalAreas('journal-other')).not.toEqual(
        await journal.listJournalAreas(user),
      )
      await expect(
        journal.updateJournalEntry('journal-other', created.id, {
          expected_updated_at: created.updated_at,
          title: 'Cross-account edit',
        }),
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        journal.deleteJournalEntry('journal-other', created.id, created.updated_at),
      ).rejects.toMatchObject({ status: 404 })
      await expect(journal.listJournalRevisions('journal-other', created.id)).rejects.toMatchObject({
        status: 404,
      })
      await expect(journal.listJournalAttachments('journal-other', created.id)).rejects.toMatchObject({
        status: 404,
      })
      await expect(journal.getJournalEntry('journal-other', created.id)).rejects.toMatchObject({
        status: 404,
      })
      await expect(journal.getJournalAttachment('journal-other', file.id)).rejects.toMatchObject({
        status: 404,
      })
      await expect(journal.deleteJournalAttachment('journal-other', file.id)).rejects.toMatchObject({
        status: 404,
      })
    } finally {
      await pool.end()
      await other.drop()
    }
    const trashed = await journal.updateJournalEntry(user, created.id, {
      expected_updated_at: created.updated_at,
      deleted: true,
    })
    await journal.deleteJournalEntry(user, created.id, trashed.updated_at)
    await expect(journal.getJournalAttachment(user, file.id)).rejects.toMatchObject({ status: 404 })
  })
  it('searches tags literally and returns stable filtered pages', async () => {
    const tag = crypto.randomUUID()
    const one = await journal.createJournalEntry(user, {
      ...body('100% literal'),
      tags: [tag],
      favorite: true,
    })
    const two = await journal.createJournalEntry(user, {
      ...body('Other'),
      tags: [tag],
      favorite: true,
      pinned: true,
    })
    const query = journalEntriesQuerySchema.parse({ tag, favorite: 'true', per_page: 1 })
    const first = await journal.listJournalEntries(user, query),
      second = await journal.listJournalEntries(user, { ...query, page: 2 })
    expect(first.total).toBe(2)
    expect(first.data[0].id).toBe(two.id)
    expect(second.data[0].id).toBe(one.id)
    expect((await journal.listJournalEntries(user, { ...query, search: '100%' })).total).toBe(1)
    await expect(
      journal.listJournalEntries(user, {
        ...query,
        from: '2026-11-14T00:00:00Z',
        to: '2026-11-12T00:00:00Z',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
