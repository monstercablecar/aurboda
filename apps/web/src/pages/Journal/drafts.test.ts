import { signal } from '@preact/signals'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
const session = vi.hoisted(() => ({ generation: 0 }))
vi.mock('../../state/auth', () => ({ auth: signal({ user: 'alice', token: 'token-a' }) }))
vi.mock('../../state/sessionBoundary', () => ({ currentSessionGeneration: () => session.generation }))
vi.mock('../../state/api/journal', () => ({
  journalApi: { create: vi.fn(), update: vi.fn(), entry: vi.fn() },
}))
import { journalApi } from '../../state/api/journal'
import { auth } from '../../state/auth'
import { JournalDraft, blankEntry } from './drafts'
const server = () => ({
  ...blankEntry(),
  id: 'entry-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'localStorage',
    (() => {
      const values = new Map<string, string>()
      return {
        get length() {
          return values.size
        },
        key: (i: number) => [...values.keys()][i] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      }
    })(),
  )
  session.generation = 0
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
describe('journal autosave', () => {
  it('serializes saves and keeps text typed during an in-flight request', async () => {
    const initial = server()
    let resolve!: (value: typeof initial) => void
    vi.mocked(journalApi.update)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
      .mockImplementationOnce(async (_id, body) => ({
        ...initial,
        content: body.content!,
        updated_at: '2026-01-03T00:00:00Z',
      }))
    const draft = new JournalDraft(initial, vi.fn(), initial)
    draft.edit({ ...initial, content: 'first' })
    const pending = draft.flush()
    draft.edit({ ...initial, content: 'second' })
    resolve({ ...initial, content: 'first', updated_at: '2026-01-02T00:00:00Z' })
    await pending
    expect(journalApi.update).toHaveBeenCalledTimes(2)
    expect(vi.mocked(journalApi.update).mock.calls[1][1]).toMatchObject({
      content: 'second',
      expected_updated_at: '2026-01-02T00:00:00Z',
    })
    expect(draft.value.content).toBe('second')
    expect(draft.status).toBe('Saved')
    draft.dispose()
  })
  it('recovers an offline draft with the original create ID', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const initial = blankEntry()
    const first = new JournalDraft(initial, vi.fn())
    first.edit({ ...initial, content: 'offline text' })
    first.dispose()
    const recovered = new JournalDraft(blankEntry(), vi.fn())
    expect(recovered.value.id).toBe(initial.id)
    expect(recovered.value.content).toBe('offline text')
    expect(recovered.recovered).toBe(true)
    recovered.dispose()
  })
  it('preserves conflicting text and saves an explicit copy', async () => {
    const initial = server()
    vi.mocked(journalApi.update).mockRejectedValue({ isAxiosError: true, response: { status: 409 } })
    vi.mocked(journalApi.create).mockImplementation(async (body) => ({ ...initial, ...body, id: body.id! }))
    const draft = new JournalDraft(initial, vi.fn(), initial)
    draft.edit({ ...initial, content: 'local' })
    await draft.flush()
    expect(draft.status).toBe('Conflict')
    expect(draft.value.content).toBe('local')
    await draft.saveCopy()
    expect(journalApi.create).toHaveBeenCalledWith(expect.objectContaining({ content: 'local' }))
    expect(draft.server?.id).not.toBe(initial.id)
    draft.dispose()
  })
  it('does not write across a session generation and clears private drafts at logout', async () => {
    const draft = new JournalDraft(blankEntry(), vi.fn())
    draft.edit({ ...draft.value, content: 'private' })
    session.generation++
    auth.value = { user: undefined, token: undefined }
    await draft.flush()
    expect(journalApi.create).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    draft.dispose()
  })
  it('uses recovered workbook answers as source of truth', () => {
    const initial = blankEntry()
    const draft = new JournalDraft(initial, vi.fn())
    draft.edit({ ...initial, title: 'Attempt 2', content: 'answer' })
    draft.dispose()
    const recovered = new JournalDraft(blankEntry(), vi.fn())
    expect(recovered.value.title).toBe('Attempt 2')
    expect(recovered.value.id).toBe(initial.id)
    recovered.dispose()
  })
})
it('retries the immutable create payload after a lost response, then patches newer text', async () => {
  const initial = blankEntry()
  const saved = { ...server(), ...initial, id: initial.id! }
  vi.mocked(journalApi.create)
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce({ ...saved, content: 'first' })
  vi.mocked(journalApi.update).mockResolvedValueOnce({
    ...saved,
    content: 'second',
    updated_at: '2026-02-01T00:00:00Z',
  })
  const draft = new JournalDraft(initial, vi.fn())
  draft.edit({ ...initial, content: 'first' })
  await draft.flush()
  draft.edit({ ...initial, content: 'second' })
  await draft.flush()
  expect(vi.mocked(journalApi.create).mock.calls[0][0]).toEqual(vi.mocked(journalApi.create).mock.calls[1][0])
  expect(journalApi.update).toHaveBeenCalledWith(initial.id, expect.objectContaining({ content: 'second' }))
  expect(draft.value.content).toBe('second')
  draft.dispose()
})
it('does not report server failure when local draft removal is blocked', async () => {
  const initial = server()
  vi.mocked(journalApi.update).mockResolvedValueOnce(initial)
  const draft = new JournalDraft(initial, vi.fn(), initial)
  draft.edit({ ...initial, content: 'saved' })
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  await draft.flush()
  expect(draft.status).toBe('Saved')
  draft.dispose()
})
it('copies workbook answers through a fresh server-owned definition', async () => {
  const initial = server()
  const definition = {
    id: 'reflection',
    version: '1',
    title: 'Reflection',
    description: '',
    category: 'wellbeing' as const,
    format: 'exercise' as const,
    audience: 'Everyone',
    suggested_area: 'General',
    source: {
      title: 'Source',
      author: 'Author',
      url: 'https://example.org',
      license: 'CC0',
      license_url: 'https://example.org',
      adaptation: '',
      reviewed_at: '',
      exclusions: '',
    },
    sections: [
      {
        id: 'section',
        title: 'Section',
        introduction: '',
        prompts: [{ id: 'answer', label: 'Question', optional: true }],
      },
    ],
  }
  const workbook = {
    definition,
    answers: { answer: 'My words' },
    completed_sections: [],
    current_section: 'section',
    status: 'in_progress' as const,
  }
  const entry = { ...initial, workbook }
  vi.mocked(journalApi.create).mockImplementation(async (body) => ({
    ...entry,
    id: body.id ?? 'copy',
    workbook: { ...workbook, answers: {} },
  }))
  vi.mocked(journalApi.update).mockImplementation(async (id, body) => ({
    ...entry,
    id,
    workbook: body.workbook ?? null,
  }))
  const draft = new JournalDraft(entry, vi.fn(), entry)
  await draft.saveCopy()
  expect(journalApi.create).toHaveBeenCalledWith(
    expect.objectContaining({ workbook_id: 'reflection', workbook: null }),
  )
  expect(journalApi.update).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ workbook: expect.objectContaining({ answers: { answer: 'My words' } }) }),
  )
  expect(draft.value.workbook?.answers.answer).toBe('My words')
  draft.dispose()
})
