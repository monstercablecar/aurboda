import { z } from 'zod'

import {
  planningDateSchema,
  planningVersionSchema,
  planningIdSchema,
  planningPageQuerySchema,
} from './native-planning-common.ts'
export const taskWorkflowStatusSchema = z
  .enum(['todo', 'in_progress', 'done'])
  .meta({ id: 'TaskWorkflowStatus', description: 'Task board column: To do, In progress, or Done.' })
export type TaskWorkflowStatus = z.infer<typeof taskWorkflowStatusSchema>

export const taskRecurrenceSchema = z.enum(['daily', 'weekly', 'monthly']).meta({
  id: 'TaskRecurrence',
  description: 'Create the next scheduled occurrence when this task is completed; daily, weekly, or monthly.',
})
export type TaskRecurrence = z.infer<typeof taskRecurrenceSchema>

const title = z.string().trim().min(1).max(255)
const stamps = { id: planningIdSchema, created_at: planningVersionSchema, updated_at: planningVersionSchema }
export const taskProjectSchema = z
  .object({ ...stamps, title })
  .meta({ id: 'TaskProject', description: 'A private project grouping tasks.' })
export type TaskProject = z.infer<typeof taskProjectSchema>
export const createTaskProjectBodySchema = z
  .object({ title })
  .meta({ id: 'CreateTaskProjectBody', description: 'Create a private task project.' })
export type CreateTaskProjectBody = z.infer<typeof createTaskProjectBodySchema>
export const updateTaskProjectBodySchema = z
  .object({ title, expected_updated_at: planningVersionSchema })
  .meta({ id: 'UpdateTaskProjectBody', description: 'Rename a project, rejecting stale edits.' })
export type UpdateTaskProjectBody = z.infer<typeof updateTaskProjectBodySchema>
const boardFields = {
  column_id: z.string().min(1).max(80).nullable().optional(),
  position: z.number().finite().optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  checklist: z
    .array(z.object({ id: z.string().min(1).max(80), title, done: z.boolean() }))
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      'Checklist IDs must be unique.',
    )
    .optional(),
  blocked_reason: z.string().max(2000).optional(),
  archived: z.boolean().optional(),
  custom_fields: z
    .array(z.object({ name: z.string().trim().min(1).max(80), value: z.string().max(1000) }))
    .max(20)
    .refine(
      (items) => new Set(items.map((item) => item.name)).size === items.length,
      'Custom field names must be unique.',
    )
    .optional(),
}
export const taskBoardColumnSchema = z
  .object({
    id: z.string().min(1).max(80),
    title,
    status: taskWorkflowStatusSchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    wip_limit: z.number().int().min(1).nullable(),
  })
  .meta({ id: 'TaskBoardColumn', description: 'A custom private board column; WIP limits are advisory.' })
export type TaskBoardColumn = z.infer<typeof taskBoardColumnSchema>
const boardColumns = z
  .array(taskBoardColumnSchema)
  .min(3)
  .max(21)
  .refine(
    (columns) =>
      new Set(columns.map((c) => c.id)).size === columns.length &&
      ['todo', 'in_progress', 'done'].every((status) => columns.some((c) => c.status === status)),
    'Use unique column IDs and at least one column for each completion category.',
  )
export const taskBoardSettingsSchema = z
  .object({ columns: boardColumns, updated_at: planningVersionSchema })
  .meta({ id: 'TaskBoardSettings', description: 'Private account board configuration.' })
export type TaskBoardSettings = z.infer<typeof taskBoardSettingsSchema>
export const updateTaskBoardBodySchema = z
  .object({ columns: boardColumns, expected_updated_at: planningVersionSchema })
  .meta({
    id: 'UpdateTaskBoardBody',
    description: 'Replace board configuration with stale-write protection.',
  })
export type UpdateTaskBoardBody = z.infer<typeof updateTaskBoardBodySchema>
export const taskBoardResponseSchema = z
  .object({ success: z.literal(true), data: taskBoardSettingsSchema })
  .meta({ id: 'TaskBoardResponse', description: 'Private board settings.' })
export type TaskBoardResponse = z.infer<typeof taskBoardResponseSchema>
const taskFields = {
  ...boardFields,
  title,
  description: z.string().max(10000),
  project_id: planningIdSchema.nullable(),
  due_date: planningDateSchema.nullable(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  done: z.boolean(),
  workflow_status: taskWorkflowStatusSchema,
  recurrence: taskRecurrenceSchema.nullable(),
}
export const taskItemSchema = z
  .object({
    ...stamps,
    ...taskFields,
    completed_at: planningVersionSchema.nullable(),
    next_occurrence_id: planningIdSchema.nullable().meta({
      description:
        'The next occurrence already created from this task, retained even if that occurrence is later deleted.',
    }),
  })
  .meta({ id: 'TaskItem', description: 'A private actionable task, independent of health metric goals.' })
export type TaskItem = z.infer<typeof taskItemSchema>
export const createTaskItemBodySchema = z
  .object({
    ...boardFields,
    title,
    description: taskFields.description.default(''),
    project_id: taskFields.project_id.default(null),
    due_date: taskFields.due_date.default(null),
    priority: taskFields.priority.default(0),
    workflow_status: taskWorkflowStatusSchema.optional(),
    recurrence: taskRecurrenceSchema.nullable().optional(),
  })
  .refine((body) => !body.recurrence || !!body.due_date, {
    message: 'Choose a due date for a repeating task.',
    path: ['due_date'],
  })
  .refine((body) => !body.recurrence || body.workflow_status !== 'done', {
    message: 'Create a repeating task open, then complete it to schedule the next occurrence.',
    path: ['workflow_status'],
  })
  .meta({
    id: 'CreateTaskItemBody',
    description:
      'Create a task in a project or the inbox. Repeating tasks require a due date and must start open.',
  })
export type CreateTaskItemBody = z.infer<typeof createTaskItemBodySchema>
export const updateTaskItemBodySchema = z
  .object(taskFields)
  .partial()
  .extend({ expected_updated_at: planningVersionSchema })
  .refine(
    (body) =>
      body.done === undefined ||
      body.workflow_status === undefined ||
      body.done === (body.workflow_status === 'done'),
    { message: 'done and workflow_status must agree', path: ['workflow_status'] },
  )
  .meta({
    id: 'UpdateTaskItemBody',
    description:
      'Edit or move a task between board columns without overwriting a stale version. Legacy done updates remain supported; supplied done and workflow_status must agree. Completing a repeating task creates its next occurrence once, atomically; recurrence=null stops future generations.',
  })
export type UpdateTaskItemBody = z.infer<typeof updateTaskItemBodySchema>
export const taskItemsQuerySchema = planningPageQuerySchema.extend({
  project_id: z.union([planningIdSchema, z.literal('inbox')]).optional(),
  status: z.enum(['all', 'open', 'done']).default('all'),
  workflow_status: taskWorkflowStatusSchema.optional(),
  search: z.string().max(255).default(''),
  archived: z.enum(['exclude', 'include', 'only']).optional(),
  column_id: z.string().min(1).max(80).optional(),
  priority: z.coerce.number().int().min(0).max(3).optional(),
  label: z.string().min(1).max(40).optional(),
  blocked: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).optional(),
  due_before: planningDateSchema.optional(),
  due_after: planningDateSchema.optional(),
  sort: z.enum(['manual', 'due', 'priority', 'newest', 'oldest', 'title']).optional(),
})
export type TaskItemsQuery = z.infer<typeof taskItemsQuerySchema>
export const taskProjectResponseSchema = z
  .object({ success: z.literal(true), data: taskProjectSchema })
  .meta({ id: 'TaskProjectResponse', description: 'TaskProject result.' })
export type TaskProjectResponse = z.infer<typeof taskProjectResponseSchema>
export const taskProjectsResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(taskProjectSchema),
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'TaskProjectsResponse', description: 'TaskProjects result.' })
export type TaskProjectsResponse = z.infer<typeof taskProjectsResponseSchema>
export const taskItemResponseSchema = z
  .object({ success: z.literal(true), data: taskItemSchema })
  .meta({ id: 'TaskItemResponse', description: 'TaskItem result.' })
export type TaskItemResponse = z.infer<typeof taskItemResponseSchema>
export const taskItemsResponseSchema = z
  .object({ success: z.literal(true), data: z.array(taskItemSchema), total: z.number().int().nonnegative() })
  .meta({ id: 'TaskItemsResponse', description: 'TaskItems result.' })
export type TaskItemsResponse = z.infer<typeof taskItemsResponseSchema>
