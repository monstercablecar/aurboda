import {
  createJournalEntryBodySchema,
  journalEntriesQuerySchema,
  updateJournalEntryBodySchema,
} from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

describe('journal shared contract', () => {
  test('writing needs only a date and leaves organization optional', () => {
    const body = createJournalEntryBodySchema.parse({ occurred_at: '2026-11-13T12:00:00Z' })
    expect(body.area_id).toBeNull()
    expect(body.title).toBe('')
    expect(body.tags).toEqual([])
  })
  test('partial saves do not reset fields the user did not edit', () => {
    expect(
      updateJournalEntryBodySchema.parse({
        expected_updated_at: '2026-11-13T12:00:00Z',
        content: 'New text',
      }),
    ).toEqual({ expected_updated_at: '2026-11-13T12:00:00Z', content: 'New text' })
  })
  test('requires a concurrency version and limits query size', () => {
    expect(updateJournalEntryBodySchema.safeParse({ content: 'Overwrite' }).success).toBe(false)
    expect(journalEntriesQuerySchema.safeParse({ per_page: '100000' }).success).toBe(false)
    expect(journalEntriesQuerySchema.parse({ page: '2' }).page).toBe(2)
  })
})
