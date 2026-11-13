import * as spec from '@aurboda/api-spec'

import { withUserTransaction } from '../db/connection.ts'
import { httpError } from '../http-error.ts'
import {
  createRecord,
  updateRecord,
  deleteRecord,
  listRecords,
  literalSearch,
  requireRow,
  rowRecord,
  checkVersion,
  stampUpdate,
  taskWorkflowStatus,
  TASK_WORKFLOW_SQL,
} from './native-tasks-store.ts'
import { getTaskBoard, lockTaskBoard, resolveTaskColumn } from './task-board.ts'
export { getTaskBoard, updateTaskBoard } from './task-board.ts'

import { nextTaskOccurrence } from './task-recurrence.ts'

export const listTaskProjects = (user: string, input: spec.PlanningPageQuery) => {
  const q = spec.planningPageQuerySchema.parse(input)
  return listRecords(
    user,
    'task_projects',
    spec.taskProjectSchema,
    q.page,
    q.per_page,
    'TRUE',
    [],
    "lower(payload->>'title'), id",
  )
}
export const createTaskProject = (user: string, input: spec.CreateTaskProjectBody) =>
  createRecord(user, 'task_projects', spec.createTaskProjectBodySchema.parse(input), spec.taskProjectSchema)
export const updateTaskProject = (user: string, id: string, input: spec.UpdateTaskProjectBody) =>
  updateRecord(
    user,
    'task_projects',
    id,
    spec.updateTaskProjectBodySchema.parse(input),
    spec.taskProjectSchema,
  )
export const deleteTaskProject = (user: string, id: string, version: string) =>
  deleteRecord(user, 'task_projects', id, spec.planningVersionSchema.parse(version))
const orders = {
  manual: "COALESCE((payload->>'position')::double precision,0), created_at, id",
  due: `(${TASK_WORKFLOW_SQL} = 'done'), (payload->>'due_date')::date NULLS LAST, created_at, id`,
  priority: "(payload->>'priority')::int DESC, created_at, id",
  newest: 'created_at DESC, id',
  oldest: 'created_at, id',
  title: "lower(payload->>'title'), id",
}
const taskOrder = (sort: spec.TaskItemsQuery['sort']) => orders[sort ?? 'due']
export const listTaskItems = async (user: string, input: spec.TaskItemsQuery) => {
  const q = spec.taskItemsQuerySchema.parse(input),
    params: unknown[] = [],
    where: string[] = []
  if (q.project_id === 'inbox') where.push('project_id IS NULL')
  else if (q.project_id) {
    params.push(q.project_id)
    where.push(`project_id=$${params.length}`)
  }
  if (q.status !== 'all') {
    params.push(q.status === 'done')
    where.push(`(${TASK_WORKFLOW_SQL} = 'done')=$${params.length}`)
  }
  if (q.workflow_status) {
    params.push(q.workflow_status)
    where.push(`(${TASK_WORKFLOW_SQL})=$${params.length}`)
  }
  const bind = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }
  if (q.archived !== 'include') {
    where.push(`COALESCE((payload->>'archived')::boolean,false)=${bind(q.archived === 'only')}`)
  }
  if (q.priority !== undefined) where.push(`(payload->>'priority')::int=${bind(q.priority)}`)
  if (q.label) where.push(`COALESCE(payload->'labels','[]'::jsonb) ? ${bind(q.label)}`)
  if (q.blocked !== undefined) {
    where.push(`(COALESCE(payload->>'blocked_reason','') <> '')=${bind(q.blocked)}`)
  }
  if (q.due_before) where.push(`(payload->>'due_date')::date <= ${bind(q.due_before)}::date`)
  if (q.due_after) where.push(`(payload->>'due_date')::date >= ${bind(q.due_after)}::date`)
  if (q.column_id) {
    const board = await getTaskBoard(user)
    const column = board.columns.find((c) => c.id === q.column_id)
    if (!column) where.push('FALSE')
    else {
      const first = board.columns.find((c) => c.status === column.status)?.id === column.id
      where.push(
        `(payload->>'column_id'=${bind(column.id)}${first ? ` OR (payload->>'column_id' IS NULL AND (${TASK_WORKFLOW_SQL})=${bind(column.status)})` : ''})`,
      )
    }
  }
  const search = bind(literalSearch(q.search))
  where.push(
    `(payload->>'title' ILIKE ${search} OR payload->>'description' ILIKE ${search} OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload->'labels','[]'::jsonb)) label WHERE label ILIKE ${search}))`,
  )

  return listRecords(
    user,
    'task_items',
    spec.taskItemSchema,
    q.page,
    q.per_page,
    where.join(' AND '),
    params,
    taskOrder(q.sort),
  )
}
export async function createTaskItem(user: string, input: spec.CreateTaskItemBody) {
  const { project_id, ...body } = spec.createTaskItemBodySchema.parse(input)
  let workflow_status = body.workflow_status ?? 'todo'
  const recurrence = body.recurrence ?? null
  return withUserTransaction(user, async (tx) => {
    const board = await lockTaskBoard(tx)
    if (project_id) await requireRow(tx, 'task_projects', project_id, 'key_share')
    const column = resolveTaskColumn(board.columns, body.column_id, workflow_status, body.workflow_status)
    workflow_status = column.status
    if (recurrence && workflow_status === 'done') {
      throw httpError(400, 'Create repeating tasks in an open column.')
    }
    const result = await tx.query('INSERT INTO task_items (project_id, payload) VALUES ($1,$2) RETURNING *', [
      project_id,
      JSON.stringify({
        ...body,
        column_id: column.id,
        workflow_status,
        recurrence,
        next_occurrence_id: null,
        recurrence_anchor_day:
          recurrence === 'monthly' && body.due_date ? Number(body.due_date.slice(8, 10)) : null,
        done: workflow_status === 'done',
        completed_at: workflow_status === 'done' ? new Date().toISOString() : null,
      }),
    ])
    return spec.taskItemSchema.parse(rowRecord(result.rows[0]))
  })
}
interface RecurrenceFields {
  due_date: string | null
  recurrence?: spec.TaskRecurrence | null
  recurrence_anchor_day?: number | null
  next_occurrence_id?: string | null
}
const mergeTaskRecurrence = (
  old: RecurrenceFields,
  patch: Pick<spec.UpdateTaskItemBody, 'due_date' | 'recurrence'>,
) => {
  const recurrence = patch.recurrence === undefined ? (old.recurrence ?? null) : patch.recurrence
  const due_date = patch.due_date === undefined ? old.due_date : patch.due_date
  if (recurrence && !due_date) {
    throw httpError(400, 'Choose a due date for a repeating task, or turn repeating off.')
  }
  const changed = recurrence !== (old.recurrence ?? null) || due_date !== old.due_date
  const recurrence_anchor_day =
    recurrence === 'monthly' && due_date
      ? changed || !old.recurrence_anchor_day
        ? Number(due_date.slice(8, 10))
        : old.recurrence_anchor_day
      : null
  return { recurrence, due_date, recurrence_anchor_day, next_occurrence_id: old.next_occurrence_id ?? null }
}

const resolvePatchedColumn = (
  columns: spec.TaskBoardColumn[],
  previousColumn: string | null,
  previousStatus: spec.TaskWorkflowStatus,
  patch: Omit<spec.UpdateTaskItemBody, 'expected_updated_at'>,
) => {
  const requestedStatus =
    patch.workflow_status ??
    (patch.done === true
      ? 'done'
      : patch.done === false && previousStatus === 'done'
        ? 'todo'
        : previousStatus)
  const column = resolveTaskColumn(
    columns,
    patch.column_id !== undefined
      ? patch.column_id
      : patch.workflow_status !== undefined || patch.done !== undefined
        ? null
        : previousColumn,
    requestedStatus,
    patch.workflow_status,
    patch.done,
  )
  return column
}
const successorMetadata = (payload: spec.TaskItem) => ({
  labels: payload.labels ?? [],
  custom_fields: payload.custom_fields ?? [],
  checklist: (payload.checklist ?? []).map((item) => ({ ...item, done: false })),
})

export async function updateTaskItem(user: string, id: string, input: spec.UpdateTaskItemBody) {
  const { expected_updated_at, project_id, ...patch } = spec.updateTaskItemBodySchema.parse(input)
  return withUserTransaction(user, async (tx) => {
    const board = await lockTaskBoard(tx)
    // Protect parent existence without blocking the FK key-share lock used by
    // a concurrent completion that creates a successor while holding the task.
    if (project_id) await requireRow(tx, 'task_projects', project_id, 'key_share')
    const old = await requireRow(tx, 'task_items', id, true)
    checkVersion(old, expected_updated_at)
    const previousStatus = taskWorkflowStatus(old.payload)
    const column = resolvePatchedColumn(board.columns, old.payload.column_id, previousStatus, patch)
    const workflow_status = column.status
    const payload = {
      ...old.payload,
      ...patch,
      column_id: column.id,
      ...mergeTaskRecurrence(old.payload, patch),
      workflow_status,
      done: workflow_status === 'done',
    }
    if (workflow_status !== 'done') payload.completed_at = null
    else if (previousStatus !== 'done') payload.completed_at = new Date().toISOString()
    const finalProject = project_id === undefined ? old.project_id : project_id
    if (
      previousStatus !== 'done' &&
      workflow_status === 'done' &&
      payload.recurrence &&
      !payload.next_occurrence_id
    ) {
      const schedule = nextTaskOccurrence(payload.due_date, payload.recurrence, payload.recurrence_anchor_day)
      const successor = {
        ...successorMetadata(payload),
        archived: false,
        position: 0,
        blocked_reason: '',
        column_id: board.columns.find((c) => c.status === 'todo')!.id,
        title: payload.title,
        description: payload.description,
        due_date: schedule.due_date,
        priority: payload.priority,
        recurrence: payload.recurrence,
        recurrence_anchor_day: schedule.recurrence_anchor_day,
        workflow_status: 'todo',
        done: false,
        completed_at: null,
        next_occurrence_id: null,
      }
      const inserted = await tx.query(
        'INSERT INTO task_items (project_id, payload) VALUES ($1,$2) RETURNING id',
        [finalProject, JSON.stringify(successor)],
      )
      payload.next_occurrence_id = inserted.rows[0].id
    }
    const result = await tx.query(
      `UPDATE task_items SET project_id=$2, payload=$3, updated_at=${stampUpdate} WHERE id=$1 RETURNING *`,
      [id, finalProject, JSON.stringify(payload)],
    )
    return spec.taskItemSchema.parse(rowRecord(result.rows[0]))
  })
}
export const deleteTaskItem = (user: string, id: string, version: string) =>
  withUserTransaction(user, async (tx) => {
    await lockTaskBoard(tx)
    const old = await requireRow(tx, 'task_items', id, true)
    checkVersion(old, spec.planningVersionSchema.parse(version))
    await tx.query('DELETE FROM task_items WHERE id=$1', [id])
  })
