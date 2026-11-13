import type { JournalWorkbookState } from '@aurboda/api-spec'

import { describe, expect, it, vi } from 'vitest'
vi.mock('./journal-catalog.ts', () => ({ JOURNAL_CATALOG: [] }))

import {
  nextJournalTimestamp,
  validateJournalAttachment,
  validateJournalWorkbook,
  JOURNAL_MAX_ATTACHMENT_BYTES,
} from './journal.ts'
const state: JournalWorkbookState = {
  definition: {
    id: 'one',
    version: '1',
    title: 'One',
    description: 'Description',
    category: 'creative_play',
    format: 'exercise',
    audience: 'Adults',
    suggested_area: 'General',
    source: {
      title: 'Source',
      author: 'Author',
      url: 'https://example.com',
      license: 'CC0',
      license_url: 'https://example.com',
      adaptation: 'Adapted',
      reviewed_at: '2026-11-13',
      exclusions: '',
    },
    sections: [
      {
        id: 'section',
        title: 'Section',
        introduction: 'Intro',
        prompts: [{ id: 'prompt', label: 'Prompt', optional: true }],
      },
    ],
  },
  answers: {},
  completed_sections: [],
  current_section: 'section',
  status: 'in_progress',
}
describe('journal invariants', () => {
  it('keeps timestamps monotonic even ahead of the wall clock', () => {
    const future = '2099-01-01T00:00:00.000Z'
    expect(nextJournalTimestamp(future)).toBe('2099-01-01T00:00:00.001Z')
  })
  it('allows answers but rejects changed definitions and foreign prompt/section ids', () => {
    expect(() =>
      validateJournalWorkbook({ ...state, answers: { prompt: 'A response' } }, state),
    ).not.toThrow()
    for (const changed of [
      null,
      { ...state, definition: { ...state.definition, version: '2' } },
      { ...state, answers: { foreign: 'No' } },
      { ...state, current_section: 'foreign' },
      { ...state, completed_sections: ['foreign'] },
    ]) {
      expect(() => validateJournalWorkbook(changed, state)).toThrow()
    }
  })
  it('uses actual bytes for limits and allows only passive media MIME types', () => {
    const base = { filename: '../../a\u0000.png', mime_type: 'image/png', bytes: Buffer.from([1]) }
    expect(validateJournalAttachment(base).filename).toBe('a_.png')
    expect(() => validateJournalAttachment({ ...base, mime_type: 'text/html' })).toThrow()
    expect(() => validateJournalAttachment({ ...base, mime_type: 'image/svg+xml' })).toThrow()
    expect(() =>
      validateJournalAttachment({ ...base, bytes: Buffer.alloc(JOURNAL_MAX_ATTACHMENT_BYTES + 1) }),
    ).toThrow()
    expect(() => validateJournalAttachment({ ...base, bytes: Buffer.alloc(0) })).toThrow()
  })
})
