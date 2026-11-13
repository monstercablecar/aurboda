import type {
  CreateJournalEntryBody,
  UpdateJournalEntryBody,
  JournalEntry,
  JournalEntriesQuery,
  JournalArea,
  JournalTemplate,
  JournalAttachment,
  JournalRevision,
  JournalWorkbookDefinition,
  CreateJournalAreaBody,
  UpdateJournalAreaBody,
  CreateJournalTemplateBody,
  UpdateJournalTemplateBody,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'
const config = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })
const url = (path: string) => `${API_URL}/journal${path}`
const get = async <T>(path: string) => (await axios.get<{ data: T }>(url(path), config())).data.data
const post = async <T>(path: string, body: unknown) =>
  (await axios.post<{ data: T }>(url(path), body, config())).data.data
const patch = async <T>(path: string, body: unknown) =>
  (await axios.patch<{ data: T }>(url(path), body, config())).data.data
const remove = async (path: string, expected_updated_at?: string) => {
  await axios.delete(url(path), { ...config(), params: { expected_updated_at } })
}
export const journalApi = {
  entries: async (params: Partial<JournalEntriesQuery> = {}) =>
    (await axios.get<{ data: JournalEntry[]; total: number }>(url('/entries'), { ...config(), params })).data,
  entry: (id: string) => get<JournalEntry>(`/entries/${encodeURIComponent(id)}`),
  create: (body: CreateJournalEntryBody) => post<JournalEntry>('/entries', body),
  update: (id: string, body: UpdateJournalEntryBody) => patch<JournalEntry>(`/entries/${id}`, body),
  deleteEntry: (entry: JournalEntry) => remove(`/entries/${entry.id}`, entry.updated_at),
  revisions: (id: string) => get<JournalRevision[]>(`/entries/${id}/revisions`),
  areas: () => get<JournalArea[]>('/areas'),
  createArea: (body: CreateJournalAreaBody) => post<JournalArea>('/areas', body),
  updateArea: (id: string, body: UpdateJournalAreaBody) => patch<JournalArea>(`/areas/${id}`, body),
  deleteArea: (area: JournalArea) => remove(`/areas/${area.id}`, area.updated_at),
  templates: () => get<JournalTemplate[]>('/templates'),
  createTemplate: (body: CreateJournalTemplateBody) => post<JournalTemplate>('/templates', body),
  updateTemplate: (id: string, body: UpdateJournalTemplateBody) =>
    patch<JournalTemplate>(`/templates/${id}`, body),
  deleteTemplate: (template: JournalTemplate) => remove(`/templates/${template.id}`, template.updated_at),
  catalog: () => get<JournalWorkbookDefinition[]>('/catalog'),
  attachments: (id: string) => get<JournalAttachment[]>(`/entries/${id}/attachments`),
  upload: (id: string, file: File, promptId?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (promptId) form.append('prompt_id', promptId)
    return post<JournalAttachment>(`/entries/${id}/attachments`, form)
  },
  attachmentBlob: async (id: string) =>
    (await axios.get<Blob>(url(`/attachments/${id}`), { ...config(), responseType: 'blob' })).data,
  deleteAttachment: (id: string) => remove(`/attachments/${id}`),
}
