import * as spec from '@aurboda/api-spec'

import type { Queryable } from '../db/pool.ts'

import { withUserTransaction } from '../db/connection.ts'
import { httpError } from '../http-error.ts'
import { checkVersion, recordVersion, stampUpdate, taskWorkflowStatus } from './native-tasks-store.ts'

export const defaultTaskColumns: spec.TaskBoardColumn[] = [
  { id: 'todo', title: 'To do', status: 'todo', color: '#64748b', wip_limit: null },
  { id: 'in_progress', title: 'In progress', status: 'in_progress', color: '#3b82f6', wip_limit: null },
  { id: 'done', title: 'Done', status: 'done', color: '#22c55e', wip_limit: null },
]
export async function lockTaskBoard(tx: Queryable): Promise<spec.TaskBoardSettings> {
  await tx.query('INSERT INTO task_board_settings (id, columns) VALUES (1,$1) ON CONFLICT DO NOTHING', [
    JSON.stringify(defaultTaskColumns),
  ])
  const result = await tx.query('SELECT * FROM task_board_settings WHERE id=1 FOR UPDATE')
  return spec.taskBoardSettingsSchema.parse({
    columns: result.rows[0].columns,
    updated_at: recordVersion(result.rows[0].updated_at),
  })
}
export const getTaskBoard = (user: string) => withUserTransaction(user, lockTaskBoard)
export function resolveTaskColumn(
  columns: spec.TaskBoardColumn[],
  columnId: string | null | undefined,
  status: spec.TaskWorkflowStatus,
  explicitStatus?: spec.TaskWorkflowStatus,
  done?: boolean,
) {
  const column = columnId ? columns.find((c) => c.id === columnId) : columns.find((c) => c.status === status)
  if (!column) throw httpError(400, 'Choose an existing board column.')
  if (
    (explicitStatus !== undefined && explicitStatus !== column.status) ||
    (done !== undefined && done !== (column.status === 'done'))
  ) {
    throw httpError(400, 'Column and completion category must agree.')
  }
  return column
}
export const updateTaskBoard = (user: string, input: spec.UpdateTaskBoardBody) => {
  const body = spec.updateTaskBoardBodySchema.parse(input)
  return withUserTransaction(user, async (tx) => {
    const old = await lockTaskBoard(tx)
    checkVersion(old, body.expected_updated_at)
    const tasks = await tx.query('SELECT payload FROM task_items')
    for (const { payload } of tasks.rows) {
      const previous =
        old.columns.find((c) => c.id === payload.column_id) ??
        old.columns.find((c) => c.status === taskWorkflowStatus(payload))!
      const next = body.columns.find((c) => c.id === previous.id)
      if (!next || next.status !== previous.status) {
        throw httpError(
          409,
          'Move tasks out of a column before deleting it or changing its completion category.',
        )
      }
    }
    // Materialize legacy assignments before a reorder changes the category's first column.
    for (const column of old.columns) {
      if (old.columns.find((c) => c.status === column.status)?.id !== column.id) continue
      await tx.query(
        `UPDATE task_items SET payload=jsonb_set(payload,'{column_id}',to_jsonb($1::text)), updated_at=${stampUpdate} WHERE payload->>'column_id' IS NULL AND (CASE WHEN payload->'done'='true'::jsonb THEN 'done' WHEN payload->>'workflow_status'='in_progress' THEN 'in_progress' ELSE 'todo' END)=$2`,
        [column.id, column.status],
      )
    }
    const result = await tx.query(
      `UPDATE task_board_settings SET columns=$1, updated_at=${stampUpdate} WHERE id=1 RETURNING *`,
      [JSON.stringify(body.columns)],
    )
    return spec.taskBoardSettingsSchema.parse({
      columns: result.rows[0].columns,
      updated_at: recordVersion(result.rows[0].updated_at),
    })
  })
}
