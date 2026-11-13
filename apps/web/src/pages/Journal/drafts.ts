import type { JournalEntry, CreateJournalEntryBody } from '@aurboda/api-spec'

import axios from 'axios'

import { journalApi } from '../../state/api/journal'
import { auth } from '../../state/auth'
import { currentSessionGeneration } from '../../state/sessionBoundary'
export type SaveStatus = 'Saved' | 'Saving' | 'Offline' | 'Save failed' | 'Conflict' | 'Recovered local draft'
const failedStatus = (error: unknown): SaveStatus =>
  axios.isAxiosError(error) && error.response?.status === 409
    ? 'Conflict'
    : navigator.onLine
      ? 'Save failed'
      : 'Offline'
const prefix = 'aurboda:journal:draft:'
let identity = JSON.stringify([auth.value.user, auth.value.token])
auth.subscribe((value) => {
  const next = JSON.stringify([value.user, value.token])
  if (next !== identity) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key?.startsWith(prefix)) localStorage.removeItem(key)
      }
    } catch {
      /* Blocked browser storage must not interrupt logout. */
    }
    identity = next
  }
})
export const entryFields = (entry: CreateJournalEntryBody): CreateJournalEntryBody => ({
  title: entry.title,
  content: entry.content,
  occurred_at: entry.occurred_at,
  area_id: entry.area_id,
  tags: entry.tags,
  favorite: entry.favorite,
  pinned: entry.pinned,
  resurface: entry.resurface,
  links: entry.links,
  workbook: entry.workbook,
})
export const blankEntry = (area_id: string | null = null): CreateJournalEntryBody => ({
  id: crypto.randomUUID(),
  title: '',
  content: '',
  occurred_at: new Date().toISOString(),
  area_id,
  tags: [],
  favorite: false,
  pinned: false,
  resurface: true,
  links: [],
  workbook: null,
})
export class JournalDraft {
  private generation = currentSessionGeneration()
  private key: string
  private revision = 0
  private savedRevision = 0
  private timer?: ReturnType<typeof setTimeout>
  private pending?: Promise<JournalEntry | undefined>
  private stopped = false
  private creation?: { value: CreateJournalEntryBody; revision: number }
  server?: JournalEntry
  value: CreateJournalEntryBody
  status: SaveStatus = 'Saved'
  recovered = false
  constructor(
    entry: CreateJournalEntryBody,
    private notify: () => void,
    server?: JournalEntry,
  ) {
    this.server = server
    this.key = `${prefix}${encodeURIComponent(auth.value.user ?? '')}:${server?.id ?? 'new'}`
    this.value = entry
    try {
      const saved = localStorage.getItem(this.key)
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft?.value?.id && typeof draft.value.content === 'string') {
          this.value = draft.value
          this.server = draft.server
          this.creation = draft.creation
          this.revision = draft.revision ?? 1
          this.recovered = true
          this.status = 'Recovered local draft'
        }
      }
    } catch {
      /* Storage may be unavailable. */
    }
  }
  get active() {
    return !this.stopped && this.generation === currentSessionGeneration()
  }
  get dirty() {
    return this.revision !== this.savedRevision
  }
  edit(value: CreateJournalEntryBody) {
    if (!this.active) return
    this.value = value
    this.revision++
    this.persist()
    this.status = navigator.onLine ? 'Saving' : 'Offline'
    this.notify()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), 700)
  }
  private clearStored() {
    try {
      localStorage.removeItem(this.key)
    } catch {
      /* Server save still succeeded. */
    }
  }
  private persist() {
    if (!this.active) return
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify({
          value: this.value,
          server: this.server,
          creation: this.creation,
          revision: this.revision,
        }),
      )
    } catch {
      this.status = 'Save failed'
    }
  }
  private async create(value: CreateJournalEntryBody): Promise<JournalEntry> {
    if (!value.workbook) return journalApi.create(value)
    const created = await journalApi.create({
      ...value,
      workbook: null,
      workbook_id: value.workbook.definition.id,
    })
    if (!this.active) return created
    if (!created.workbook) throw new Error('The reflection is no longer available.')
    const promptIds = new Set(
      created.workbook.definition.sections.flatMap((section) => section.prompts.map((prompt) => prompt.id)),
    )
    if (Object.keys(value.workbook.answers).some((id) => !promptIds.has(id))) {
      throw new Error('The reflection questions changed; your local answers remain available.')
    }
    const workbook = { ...value.workbook, definition: created.workbook.definition }
    const result = await journalApi.update(created.id, {
      ...entryFields(value),
      workbook,
      expected_updated_at: created.updated_at,
    })
    return result
  }
  private get shouldDrain() {
    return this.active && this.dirty && this.status === 'Saving'
  }
  async flush(): Promise<JournalEntry | undefined> {
    clearTimeout(this.timer)
    if (!this.active) return undefined
    if (this.pending) {
      await this.pending
      return this.dirty && this.status !== 'Conflict' ? this.flush() : this.server
    }
    if (this.status === 'Conflict') return undefined
    if (!this.dirty && this.server) return this.server
    if (!navigator.onLine) {
      this.status = 'Offline'
      this.notify()
      return undefined
    }
    if (!this.server && !this.creation) {
      this.creation = { value: structuredClone(this.value), revision: this.revision }
      this.persist()
    }
    const creation = this.creation
    const revision = creation ? creation.revision : this.revision
    const value = creation ? creation.value : this.value
    this.status = 'Saving'
    this.notify()
    this.pending = (async () => {
      try {
        const result = this.server
          ? await journalApi.update(this.server.id, {
              ...entryFields(value),
              expected_updated_at: this.server.updated_at,
            })
          : await this.create(value)
        if (!this.active) return undefined
        this.server = result
        this.creation = undefined
        this.savedRevision = revision
        if (this.revision === revision) {
          this.value = { ...entryFields(result), id: result.id }
          this.clearStored()
          this.status = 'Saved'
        } else {
          this.persist()
          this.status = 'Saving'
        }
        return result
      } catch (error) {
        if (this.active) {
          this.status = failedStatus(error)
          this.persist()
        }
        return undefined
      } finally {
        this.pending = undefined
        if (this.active) this.notify()
      }
    })()
    const result = await this.pending
    if (this.shouldDrain) return this.flush()
    return result
  }
  async reload() {
    if (!this.server) return
    const value = await journalApi.entry(this.server.id)
    if (!this.active) return
    this.server = value
    this.value = { ...entryFields(value), id: value.id }
    this.revision = this.savedRevision = 0
    this.clearStored()
    this.status = 'Saved'
    this.notify()
  }
  async saveCopy() {
    if (!this.active) return
    this.server = undefined
    this.creation = undefined
    this.value = { ...entryFields(this.value), id: crypto.randomUUID() }
    this.status = 'Saving'
    this.revision++
    this.persist()
    await this.flush()
  }
  dispose() {
    this.stopped = true
    clearTimeout(this.timer)
  }
}
