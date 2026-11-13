import type {
  CreateJournalEntryBody,
  UpdateJournalEntryBody,
  JournalEntry,
  JournalEntriesQuery,
  JournalArea,
  CreateJournalAreaBody,
  UpdateJournalAreaBody,
  JournalTemplate,
  CreateJournalTemplateBody,
  UpdateJournalTemplateBody,
  JournalAttachment,
  JournalRevision,
  JournalWorkbookState,
} from '@aurboda/api-spec'

import {
  createJournalEntryBodySchema,
  updateJournalEntryBodySchema,
  journalEntriesQuerySchema,
  createJournalAreaBodySchema,
  updateJournalAreaBodySchema,
  createJournalTemplateBodySchema,
  updateJournalTemplateBodySchema,
} from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

import type { Queryable } from '../db/pool.ts'

import { withUserTransaction } from '../db/connection.ts'
import { httpError } from '../http-error.ts'
import { JOURNAL_CATALOG } from './journal-catalog.ts'

const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input)
  if (!result.success) throw httpError(400, 'Invalid journal request.')
  return result.data
}
const uuid = (id: string) => parse(z.uuid(), id)
const timestamp = (value: string) => parse(z.iso.datetime({ offset: true }), value)
const transact = <T>(user: string, fn: (tx: Queryable) => Promise<T>) =>
  withUserTransaction(user, async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('journal',0))")
    return fn(tx)
  })
const iso = (value: Date | string) => new Date(value).toISOString()
export const nextJournalTimestamp = (previous?: string) =>
  new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString()
const checkVersion = (actual: string, expected: string) => {
  if (Date.parse(actual) !== Date.parse(timestamp(expected))) {
    throw httpError(409, 'This journal record changed. Reload before saving.')
  }
}
type EntryRow = {
  id: string
  area_id: string | null
  payload: Omit<JournalEntry, 'id' | 'area_id' | 'created_at' | 'updated_at' | 'deleted_at'>
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  create_request: unknown
}
const entry = (r: EntryRow): JournalEntry => ({
  ...r.payload,
  id: r.id,
  area_id: r.area_id,
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
  deleted_at: r.deleted_at ? iso(r.deleted_at) : null,
})
const getEntry = async (tx: Queryable, id: string) => {
  const rows = await tx.query<EntryRow>('SELECT * FROM journal_entries WHERE id=$1 FOR UPDATE', [uuid(id)])
  if (!rows.rows[0]) throw httpError(404, 'Journal entry not found.')
  return entry(rows.rows[0])
}
const revision = async (tx: Queryable, previous: JournalEntry, now: string) => {
  await tx.query('INSERT INTO journal_revisions(id,entry_id,snapshot,created_at) VALUES($1,$2,$3,$4)', [
    randomUUID(),
    previous.id,
    previous,
    now,
  ])
}
const saveEntry = async (tx: Queryable, value: JournalEntry) => {
  const { id, area_id, created_at: _created, updated_at, deleted_at, ...payload } = value
  await tx.query('UPDATE journal_entries SET area_id=$2,payload=$3,updated_at=$4,deleted_at=$5 WHERE id=$1', [
    id,
    area_id,
    payload,
    updated_at,
    deleted_at,
  ])
  return value
}
const validateArea = async (tx: Queryable, id: string | null) => {
  if (
    id &&
    !(await tx.query('SELECT id FROM journal_areas WHERE id=$1 AND NOT archived', [uuid(id)])).rowCount
  ) {
    throw httpError(400, 'Choose an active journal area.')
  }
}
export const validateJournalWorkbook = (
  state: JournalWorkbookState | null,
  previous: JournalWorkbookState | null,
) => {
  if (!isDeepStrictEqual(state?.definition ?? null, previous?.definition ?? null)) {
    throw httpError(400, 'Workbook definition cannot be replaced or removed.')
  }
  if (!state) return
  const sections = new Set(state.definition.sections.map((s) => s.id))
  const prompts = new Set(state.definition.sections.flatMap((s) => s.prompts.map((p) => p.id)))
  if (
    !sections.has(state.current_section) ||
    state.completed_sections.some((id) => !sections.has(id)) ||
    Object.keys(state.answers).some((id) => !prompts.has(id))
  ) {
    throw httpError(400, 'Unknown workbook section or prompt.')
  }
}
export const getJournalEntry = (user: string, id: string) => transact(user, (tx) => getEntry(tx, id))
export const createJournalEntry = (user: string, input: CreateJournalEntryBody) =>
  transact(user, async (tx) => {
    const body = parse(createJournalEntryBodySchema, input)
    const id = body.id ?? randomUUID()
    const exists = await tx.query<EntryRow>('SELECT * FROM journal_entries WHERE id=$1', [id])
    if (exists.rows[0]) {
      if (!isDeepStrictEqual(exists.rows[0].create_request, body)) {
        throw httpError(409, 'Journal entry id already exists with different content.')
      }
      return entry(exists.rows[0])
    }
    if (body.workbook) throw httpError(400, 'Choose a workbook from the catalog.')
    if (body.workbook_id && body.template_id) throw httpError(400, 'Choose either a workbook or a template.')
    await validateArea(tx, body.area_id)
    const { workbook_id, template_id, id: _id, ...payload } = body
    if (workbook_id) {
      const definition = JOURNAL_CATALOG.find((d) => d.id === workbook_id)
      if (!definition) throw httpError(400, 'Unknown workbook.')
      payload.workbook = {
        definition: structuredClone(definition),
        answers: {},
        completed_sections: [],
        current_section: definition.sections[0].id,
        status: 'in_progress',
      }
      if (!payload.title) payload.title = definition.title
    }
    if (template_id) {
      const template = await getTemplate(tx, template_id)
      payload.content = template.content
      if (!payload.title) payload.title = template.title
    }
    const now = nextJournalTimestamp()
    const { area_id, ...stored } = payload
    await tx.query(
      'INSERT INTO journal_entries(id,area_id,payload,create_request,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',
      [id, area_id, stored, body, now],
    )
    return getEntry(tx, id)
  })
export const updateJournalEntry = (user: string, id: string, input: UpdateJournalEntryBody) =>
  transact(user, async (tx) => {
    const body = parse(updateJournalEntryBodySchema, input)
    const old = await getEntry(tx, id)
    checkVersion(old.updated_at, body.expected_updated_at)
    if (body.area_id !== undefined && body.area_id !== old.area_id) await validateArea(tx, body.area_id)
    if (body.workbook !== undefined) validateJournalWorkbook(body.workbook, old.workbook)
    const { expected_updated_at: _expected, deleted, ...changes } = body
    const now = nextJournalTimestamp(old.updated_at)
    const value = {
      ...old,
      ...changes,
      updated_at: now,
      deleted_at: deleted === undefined ? old.deleted_at : deleted ? (old.deleted_at ?? now) : null,
    }
    await revision(tx, old, now)
    return saveEntry(tx, value)
  })
export const deleteJournalEntry = (user: string, id: string, expected: string) =>
  transact(user, async (tx) => {
    const old = await getEntry(tx, id)
    checkVersion(old.updated_at, expected)
    if (!old.deleted_at) throw httpError(409, 'Move this entry to trash before permanently deleting it.')
    await tx.query('DELETE FROM journal_entries WHERE id=$1', [id])
  })
export const listJournalEntries = (user: string, input: JournalEntriesQuery) =>
  transact(user, async (tx) => {
    const q = parse(journalEntriesQuerySchema, input)
    if (q.from && q.to && Date.parse(q.from) > Date.parse(q.to)) {
      throw httpError(400, 'Start date must precede end date.')
    }
    const values: unknown[] = []
    const where: string[] = [q.deleted === 'true' ? 'e.deleted_at IS NOT NULL' : 'e.deleted_at IS NULL']
    const add = (sql: string, value: unknown) => {
      values.push(value)
      where.push(sql.replace('?', `$${values.length}`))
    }
    if (q.area_id === 'general') where.push('e.area_id IS NULL')
    else if (q.area_id) add('e.area_id=?', q.area_id)
    if (q.search) {
      add(
        "concat_ws(' ',e.payload->>'title',e.payload->>'content',e.payload->'tags',e.payload->'workbook'->'answers') ILIKE ? ESCAPE '\\'",
        `%${q.search.replaceAll(/[\\%_]/g, '\\$&')}%`,
      )
    }
    if (q.tag) add("jsonb_exists(e.payload->'tags', ?)", q.tag)
    if (q.from) add("(e.payload->>'occurred_at')::timestamptz >= ?", q.from)
    if (q.to) add("(e.payload->>'occurred_at')::timestamptz <= ?", q.to)
    if (q.favorite) add("(e.payload->>'favorite')::boolean = ?", q.favorite === 'true')
    if (q.kind === 'workbook') where.push("e.payload->'workbook' <> 'null'::jsonb")
    if (q.kind === 'audio') {
      where.push(
        "EXISTS(SELECT 1 FROM journal_attachments a WHERE a.entry_id=e.id AND a.mime_type LIKE 'audio/%')",
      )
    }
    if (q.kind === 'text') {
      where.push(
        "e.payload->'workbook' = 'null'::jsonb AND NOT EXISTS(SELECT 1 FROM journal_attachments a WHERE a.entry_id=e.id AND a.mime_type LIKE 'audio/%')",
      )
    }
    const filter = where.join(' AND ')
    const count = await tx.query<{ total: string }>(
      `SELECT count(*) AS total FROM journal_entries e WHERE ${filter}`,
      values,
    )
    const rows = await tx.query<EntryRow>(
      `SELECT e.* FROM journal_entries e WHERE ${filter} ORDER BY (e.payload->>'pinned')::boolean DESC,(e.payload->>'occurred_at')::timestamptz DESC,e.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, q.per_page, (q.page - 1) * q.per_page],
    )
    return { data: rows.rows.map(entry), total: Number(count.rows[0].total) }
  })
const dated = <T extends { created_at: unknown; updated_at: unknown }>(row: T) => ({
  ...row,
  created_at: iso(row.created_at as Date),
  updated_at: iso(row.updated_at as Date),
})
const seedAreas = async (tx: Queryable) => {
  await tx.query('INSERT INTO journal_settings(id) VALUES(TRUE) ON CONFLICT DO NOTHING')
  const initialized = await tx.query<{ areas_initialized: boolean }>(
    'SELECT areas_initialized FROM journal_settings WHERE id=TRUE',
  )
  if (initialized.rows[0].areas_initialized) return
  const names = [
    'Mental health',
    'Relationships',
    'Work',
    'Physical health',
    'Recreation',
    'Family & parenting',
    'Personal growth',
    'Creativity & learning',
    'Meaning & spirituality',
  ]
  for (const [position, name] of names.entries()) {
    const now = nextJournalTimestamp()
    await tx.query(
      'INSERT INTO journal_areas(id,name,position,created_at,updated_at) VALUES($1,$2,$3,$4,$4)',
      [randomUUID(), name, position, now],
    )
  }
  await tx.query('UPDATE journal_settings SET areas_initialized=TRUE WHERE id=TRUE')
}
const getArea = async (tx: Queryable, id: string) => {
  const r = await tx.query<JournalArea>('SELECT * FROM journal_areas WHERE id=$1 FOR UPDATE', [uuid(id)])
  if (!r.rows[0]) throw httpError(404, 'Journal area not found.')
  return dated(r.rows[0])
}
export const listJournalAreas = (user: string) =>
  transact(user, async (tx) => {
    await seedAreas(tx)
    return (await tx.query<JournalArea>('SELECT * FROM journal_areas ORDER BY position,name,id')).rows.map(
      dated,
    )
  })
export const createJournalArea = (user: string, input: CreateJournalAreaBody) =>
  transact(user, async (tx) => {
    const body = parse(createJournalAreaBodySchema, input)
    await seedAreas(tx)
    const now = nextJournalTimestamp(),
      id = randomUUID()
    await tx.query(
      'INSERT INTO journal_areas(id,name,position,archived,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',
      [id, body.name, body.position, body.archived, now],
    )
    return getArea(tx, id)
  })
export const updateJournalArea = (user: string, id: string, input: UpdateJournalAreaBody) =>
  transact(user, async (tx) => {
    const body = parse(updateJournalAreaBodySchema, input)
    const old = await getArea(tx, id)
    checkVersion(old.updated_at, body.expected_updated_at)
    const value = { ...old, ...body }
    await tx.query('UPDATE journal_areas SET name=$2,position=$3,archived=$4,updated_at=$5 WHERE id=$1', [
      id,
      value.name,
      value.position,
      value.archived,
      nextJournalTimestamp(old.updated_at),
    ])
    return getArea(tx, id)
  })
export const deleteJournalArea = (user: string, id: string, expected: string) =>
  transact(user, async (tx) => {
    const area = await getArea(tx, id)
    checkVersion(area.updated_at, expected)
    const entries = await tx.query<EntryRow>('SELECT * FROM journal_entries WHERE area_id=$1 FOR UPDATE', [
      id,
    ])
    for (const row of entries.rows) {
      const old = entry(row),
        now = nextJournalTimestamp(iso(row.updated_at))
      await revision(tx, old, now)
      await saveEntry(tx, { ...old, area_id: null, updated_at: now })
    }
    await tx.query('DELETE FROM journal_areas WHERE id=$1', [id])
  })
const getTemplate = async (tx: Queryable, id: string) => {
  const r = await tx.query<JournalTemplate>('SELECT * FROM journal_templates WHERE id=$1 FOR UPDATE', [
    uuid(id),
  ])
  if (!r.rows[0]) throw httpError(404, 'Journal template not found.')
  return dated(r.rows[0])
}
export const listJournalTemplates = (user: string) =>
  transact(user, async (tx) =>
    (await tx.query<JournalTemplate>('SELECT * FROM journal_templates ORDER BY title,id')).rows.map(dated),
  )
export const createJournalTemplate = (user: string, input: CreateJournalTemplateBody) =>
  transact(user, async (tx) => {
    const body = parse(createJournalTemplateBodySchema, input),
      id = randomUUID(),
      now = nextJournalTimestamp()
    await tx.query(
      'INSERT INTO journal_templates(id,title,content,created_at,updated_at) VALUES($1,$2,$3,$4,$4)',
      [id, body.title, body.content, now],
    )
    return getTemplate(tx, id)
  })
export const updateJournalTemplate = (user: string, id: string, input: UpdateJournalTemplateBody) =>
  transact(user, async (tx) => {
    const body = parse(updateJournalTemplateBodySchema, input),
      old = await getTemplate(tx, id)
    checkVersion(old.updated_at, body.expected_updated_at)
    await tx.query('UPDATE journal_templates SET title=$2,content=$3,updated_at=$4 WHERE id=$1', [
      id,
      body.title ?? old.title,
      body.content ?? old.content,
      nextJournalTimestamp(old.updated_at),
    ])
    return getTemplate(tx, id)
  })
export const deleteJournalTemplate = (user: string, id: string, expected: string) =>
  transact(user, async (tx) => {
    const old = await getTemplate(tx, id)
    checkVersion(old.updated_at, expected)
    await tx.query('DELETE FROM journal_templates WHERE id=$1', [id])
  })
export const listJournalRevisions = (user: string, id: string) =>
  transact(user, async (tx) => {
    await getEntry(tx, id)
    return (
      await tx.query<JournalRevision>(
        'SELECT * FROM journal_revisions WHERE entry_id=$1 ORDER BY created_at DESC,id LIMIT 100',
        [id],
      )
    ).rows.map((r) => ({ ...r, created_at: iso(r.created_at) }))
  })
export const JOURNAL_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const allowedMime = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/flac',
])
export const validateJournalAttachment = (file: { filename: string; mime_type: string; bytes: Buffer }) => {
  const mime_type = file.mime_type.split(';')[0].trim().toLowerCase()
  if (!allowedMime.has(mime_type)) throw httpError(400, 'Unsupported journal attachment type.')
  if (file.bytes.length === 0 || file.bytes.length > JOURNAL_MAX_ATTACHMENT_BYTES) {
    throw httpError(413, 'Attachments must be between 1 byte and 20 MB.')
  }
  const filename =
    file.filename
      .split(/[\\/]/)
      .pop()
      ?.replaceAll(/[^\P{Cc}]|["<>]/gu, '_')
      .slice(0, 200) || 'attachment'
  return { filename, mime_type }
}
const attachmentColumns = 'id,entry_id,filename,mime_type,size,prompt_id,created_at'
const attachment = (r: JournalAttachment): JournalAttachment => ({ ...r, created_at: iso(r.created_at) })
export const listJournalAttachments = (user: string, id: string) =>
  transact(user, async (tx) => {
    await getEntry(tx, id)
    return (
      await tx.query<JournalAttachment>(
        `SELECT ${attachmentColumns} FROM journal_attachments WHERE entry_id=$1 ORDER BY created_at,id`,
        [id],
      )
    ).rows.map(attachment)
  })
export const addJournalAttachment = (
  user: string,
  id: string,
  file: { filename: string; mime_type: string; bytes: Buffer; prompt_id?: string | null },
) =>
  transact(user, async (tx) => {
    const clean = validateJournalAttachment(file),
      old = await getEntry(tx, id)
    if (old.deleted_at) throw httpError(409, 'Restore this entry before adding attachments.')
    if (
      file.prompt_id != null &&
      !old.workbook?.definition.sections.some((s) => s.prompts.some((p) => p.id === file.prompt_id))
    ) {
      throw httpError(400, 'Unknown workbook prompt.')
    }
    const result = await tx.query<JournalAttachment>(
      `INSERT INTO journal_attachments(id,entry_id,filename,mime_type,size,prompt_id,bytes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${attachmentColumns}`,
      [
        randomUUID(),
        id,
        clean.filename,
        clean.mime_type,
        file.bytes.length,
        file.prompt_id ?? null,
        file.bytes,
        nextJournalTimestamp(),
      ],
    )
    return attachment(result.rows[0])
  })
export const getJournalAttachment = (user: string, id: string) =>
  transact(user, async (tx) => {
    const result = await tx.query<JournalAttachment & { bytes: Buffer }>(
      'SELECT * FROM journal_attachments WHERE id=$1',
      [uuid(id)],
    )
    if (!result.rows[0]) throw httpError(404, 'Journal attachment not found.')
    const { bytes, ...metadata } = result.rows[0]
    return { metadata: attachment(metadata), bytes }
  })
export const deleteJournalAttachment = (user: string, id: string) =>
  transact(user, async (tx) => {
    if (!(await tx.query('DELETE FROM journal_attachments WHERE id=$1', [uuid(id)])).rowCount) {
      throw httpError(404, 'Journal attachment not found.')
    }
  })
