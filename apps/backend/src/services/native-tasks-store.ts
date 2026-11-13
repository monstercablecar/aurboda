import type { z } from 'zod'

import { planningIdSchema, type TaskWorkflowStatus } from '@aurboda/api-spec'

import type { Queryable } from '../db/pool.ts'

import { query, withUserTransaction } from '../db/connection.ts'
import { httpError } from '../http-error.ts'

export type PlanningTable = 'task_projects' | 'task_items'
export const stampUpdate =
  "GREATEST(date_trunc('milliseconds', clock_timestamp()), updated_at + interval '1 millisecond')"
export const validId = (id: string) => {
  if (!planningIdSchema.safeParse(id).success) throw httpError(400, 'Invalid identifier')
  return id
}
export const recordVersion = (value: Date | string) => new Date(value).toISOString()
/** Legacy tasks only had done; it remains authoritative if a stored state disagrees. */
export const taskWorkflowStatus = (payload: Record<string, unknown>): TaskWorkflowStatus =>
  payload.done === true ? 'done' : payload.workflow_status === 'in_progress' ? 'in_progress' : 'todo'

/** Keep SQL filtering identical to taskWorkflowStatus, including legacy rows. */
export const TASK_WORKFLOW_SQL =
  "CASE WHEN payload->'done' = 'true'::jsonb THEN 'done' WHEN payload->>'workflow_status' = 'in_progress' THEN 'in_progress' ELSE 'todo' END"

export const rowRecord = (row: Record<string, unknown>) => ({
  ...((row.payload ?? {}) as Record<string, unknown>),
  ...(Object.hasOwn(row, 'project_id')
    ? {
        column_id: null,
        position: 0,
        labels: [],
        checklist: [],
        blocked_reason: '',
        archived: false,
        custom_fields: [],
        ...((row.payload ?? {}) as Record<string, unknown>),
        project_id: row.project_id,
        workflow_status: taskWorkflowStatus((row.payload ?? {}) as Record<string, unknown>),
        recurrence: (row.payload as Record<string, unknown> | undefined)?.recurrence ?? null,
        next_occurrence_id: (row.payload as Record<string, unknown> | undefined)?.next_occurrence_id ?? null,
      }
    : {}),
  id: row.id,
  created_at: recordVersion(row.created_at as Date),
  updated_at: recordVersion(row.updated_at as Date),
})
export async function requireRow(
  tx: Queryable,
  table: PlanningTable,
  id: string,
  lock: boolean | 'key_share' = false,
) {
  const clause = lock === 'key_share' ? ' FOR KEY SHARE' : lock ? ' FOR UPDATE' : ''
  const result = await tx.query(`SELECT * FROM ${table} WHERE id=$1${clause}`, [validId(id)])
  if (!result.rows[0]) throw httpError(404, 'Item not found')
  return result.rows[0]
}
export const checkVersion = (row: Record<string, unknown>, version: string) => {
  if (recordVersion(row.updated_at as Date) !== recordVersion(version)) {
    throw httpError(409, 'This item changed. Refresh before saving or deleting.')
  }
}
export async function getRecord<T>(
  user: string,
  table: PlanningTable,
  id: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = await query(user, `SELECT * FROM ${table} WHERE id=$1`, [validId(id)])
  if (!result.rows[0]) throw httpError(404, 'Item not found')
  return schema.parse(rowRecord(result.rows[0]))
}
export async function createRecord<T>(
  user: string,
  table: PlanningTable,
  payload: object,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = await query(user, `INSERT INTO ${table} (payload) VALUES ($1) RETURNING *`, [
    JSON.stringify(payload),
  ])
  return schema.parse(rowRecord(result.rows[0]))
}
export async function updateRecord<T>(
  user: string,
  table: PlanningTable,
  id: string,
  body: { expected_updated_at: string },
  schema: z.ZodType<T>,
): Promise<T> {
  return withUserTransaction(user, async (tx) => {
    const old = await requireRow(tx, table, id, true)
    checkVersion(old, body.expected_updated_at)
    const { expected_updated_at: _version, ...patch } = body
    const result = await tx.query(
      `UPDATE ${table} SET payload=payload || $2::jsonb, updated_at=${stampUpdate} WHERE id=$1 RETURNING *`,
      [id, JSON.stringify(patch)],
    )
    return schema.parse(rowRecord(result.rows[0]))
  })
}
export async function deleteRecord(
  user: string,
  table: PlanningTable,
  id: string,
  version: string,
): Promise<void> {
  await withUserTransaction(user, async (tx) => {
    const old = await requireRow(tx, table, id, true)
    checkVersion(old, version)
    if (table === 'task_projects') {
      const used = await tx.query('SELECT 1 FROM task_items WHERE project_id=$1 LIMIT 1', [id])
      if (used.rows.length) throw httpError(409, 'Move or delete the project tasks first.')
    }
    await tx.query(`DELETE FROM ${table} WHERE id=$1`, [id])
  })
}
export async function listRecords<T>(
  user: string,
  table: PlanningTable,
  schema: z.ZodType<T>,
  page: number,
  perPage: number,
  where = 'TRUE',
  params: unknown[] = [],
  order = 'created_at DESC, id',
) {
  // Table, clauses and order are constants from the domain service, never request strings.
  const count = await query(user, `SELECT count(*)::int AS total FROM ${table} WHERE ${where}`, params)
  const rows = await query(
    user,
    `SELECT * FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage],
  )
  return {
    success: true as const,
    data: rows.rows.map((row) => schema.parse(rowRecord(row))),
    total: Number(count.rows[0].total),
  }
}
export const literalSearch = (value: string) => '%' + value.replaceAll(/[\\%_]/g, '\\$&') + '%'
