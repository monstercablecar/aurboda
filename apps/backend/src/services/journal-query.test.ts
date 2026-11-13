import { journalEntriesQuerySchema } from '@aurboda/api-spec'
import { beforeEach, expect, test, vi } from 'vitest'

import { withUserTransaction } from '../db/connection.ts'
import { getJournalCapabilities, listJournalEntries } from './journal.ts'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../db/connection.ts', () => ({
  withUserTransaction: vi.fn(async (_user, action) => action({ query })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('count(*)') ? [{ total: '0' }] : [],
  }))
})

test('search filters remain parameterized in the authenticated database with workbook identity and pagination', async () => {
  const filters = journalEntriesQuerySchema.parse({
    search: "x%' OR TRUE--",
    workbook_id: "workbook' OR TRUE--",
    area_id: 'general',
    tag: 'private',
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-13T00:00:00Z',
    page: 3,
    per_page: 10,
  })
  expect(await listJournalEntries('authenticated-owner', filters)).toEqual({ data: [], total: 0 })
  expect(withUserTransaction).toHaveBeenCalledWith('authenticated-owner', expect.any(Function))
  const count = query.mock.calls.find(([sql]) => String(sql).includes('count(*)'))
  const rows = query.mock.calls.find(([sql]) => String(sql).includes('SELECT e.*'))
  if (!count || !rows) throw new Error('Expected count and page queries')
  expect(count[0]).toContain("e.payload->'workbook'->'definition'->>'id' = $3")
  expect(count[0]).toContain('e.area_id IS NULL')
  expect(count[0]).not.toContain('OR TRUE--')
  expect(count[1]).toEqual(["%x\\%' OR TRUE--%", 'private', "workbook' OR TRUE--", filters.from, filters.to])
  expect(rows[1]).toEqual([...count[1], 10, 20])
})

test('capabilities match the shared query pagination limits and existing original-byte limits', () => {
  const capabilities = getJournalCapabilities()
  const defaults = journalEntriesQuerySchema.parse({})
  expect(capabilities.pagination.default_per_page).toBe(defaults.per_page)
  expect(
    journalEntriesQuerySchema.safeParse({ per_page: capabilities.pagination.max_per_page }).success,
  ).toBe(true)
  expect(
    journalEntriesQuerySchema.safeParse({ per_page: capabilities.pagination.max_per_page + 1 }).success,
  ).toBe(false)
  expect(capabilities.attachments.transcription).toBe(false)
})

test('invalid date order fails before querying private entry data', async () => {
  const filters = journalEntriesQuerySchema.parse({
    from: '2026-11-13T00:00:00Z',
    to: '2026-11-01T00:00:00Z',
  })
  await expect(listJournalEntries('authenticated-owner', filters)).rejects.toMatchObject({ status: 400 })
  expect(query.mock.calls.every(([sql]) => String(sql).includes('pg_advisory_xact_lock'))).toBe(true)
})
