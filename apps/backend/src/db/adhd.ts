import { adhdSettingsSchema, type AdhdRecord, type AdhdSettings, type AdhdContext } from '@aurboda/api-spec'

import type { Queryable } from './pool.ts'

import { httpError } from '../http-error.ts'
const fail = (status: number, message: string): never => {
  throw httpError(status, message)
}
const json = (value: unknown) => JSON.stringify(value)
const iso = (value: Date | string) => new Date(value).toISOString()
export interface Row {
  id: string
  kind: string
  revision: number
  parent_id: string | null
  data: Record<string, unknown>
  created_at: Date
  updated_at: Date
}
export const serialize = (r: Row): AdhdRecord => ({
  ...r,
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
})
export const getRecord = async (tx: Queryable, id: string, kind?: string) => {
  const r = (await tx.query<Row>('SELECT * FROM adhd_records WHERE id=$1 FOR UPDATE', [id])).rows[0]
  if (!r || (kind && r.kind !== kind)) return fail(404, 'Private record not found.')
  return r
}
export const cas = (r: { revision: number }, expected: number) => {
  if (r.revision !== expected) fail(409, 'This record changed. Reload before editing.')
}
export const insert = async (
  tx: Queryable,
  kind: string,
  data: Record<string, unknown>,
  parent: string | null = null,
) =>
  (
    await tx.query<Row>('INSERT INTO adhd_records(kind,data,parent_id) VALUES($1,$2,$3) RETURNING *', [
      kind,
      json(data),
      parent,
    ])
  ).rows[0]!
export const update = async (tx: Queryable, row: Row, data: Record<string, unknown>) =>
  (
    await tx.query<Row>(
      'UPDATE adhd_records SET data=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND revision=$3 RETURNING *',
      [row.id, json(data), row.revision],
    )
  ).rows[0] ?? fail(409, 'Concurrent change; reload.')
export const settings = async (tx: Queryable) => {
  const row = (
    await tx.query<{ revision: number; data: AdhdSettings }>(
      'SELECT revision,data FROM adhd_settings WHERE singleton=true FOR UPDATE',
    )
  ).rows[0]
  if (row) return row
  const inherited = (
    await tx.query<{ timezone: string | null }>(
      "SELECT settings->>'device_timezone' AS timezone FROM user_settings LIMIT 1",
    )
  ).rows[0]?.timezone
  const data = adhdSettingsSchema.parse({})
  if (inherited) {
    try {
      Temporal.Now.zonedDateTimeISO(inherited)
      data.timezone = inherited
    } catch {
      /* Invalid historical preference does not break the private page. */
    }
  }
  return { revision: 0, data }
}
export const contextCheck = async (tx: Queryable, ctx: AdhdContext) => {
  for (const [id, table] of [
    [ctx.task_id, 'task_items'],
    [ctx.project_id, 'task_projects'],
    [ctx.journal_id, 'journal_entries'],
  ] as const) {
    if (
      id &&
      !(
        await tx.query(
          `SELECT id FROM ${table} WHERE id=$1${table === 'journal_entries' ? ' AND deleted_at IS NULL' : ''}`,
          [id],
        )
      ).rowCount
    ) {
      fail(404, 'Context reference not found in this account.')
    }
  }
  if (ctx.task_id && !ctx.target) fail(400, 'A task requires its visible target snapshot.')
  if (ctx.main_sleep_id || ctx.main_sleep_confirmed) {
    fail(400, 'Main-sleep linking requires a confirmed normalized sleep selector; leave unknown here.')
  }
}
