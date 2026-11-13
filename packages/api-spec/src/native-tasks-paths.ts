import { z } from 'zod'

import * as spec from './schemas/index.ts'
const operation = (
  summary: string,
  response: z.ZodType,
  body?: z.ZodType,
  id = false,
  query?: z.ZodType,
  created = false,
) => ({
  summary,
  tags: ['Tasks'],
  security: [{ bearerAuth: [] }],
  ...(id || query
    ? { requestParams: { ...(id ? { path: z.object({ id: z.uuid() }) } : {}), ...(query ? { query } : {}) } }
    : {}),
  ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
  responses: {
    [created ? 201 : 200]: { description: 'Success', content: { 'application/json': { schema: response } } },
    400: { description: 'Invalid input' },
    401: { description: 'Authentication required' },
    404: { description: 'Item not found' },
    409: { description: 'Stale edit or conflicting retry; refresh before continuing' },
  },
})
export const nativeTaskPaths = {
  '/tasks/board': {
    get: operation('Read private board configuration.', spec.taskBoardResponseSchema),
    patch: operation(
      'Update private board configuration.',
      spec.taskBoardResponseSchema,
      spec.updateTaskBoardBodySchema,
    ),
  },
  '/tasks/projects': {
    get: operation(
      'List your private task projects.',
      spec.taskProjectsResponseSchema,
      undefined,
      false,
      spec.planningPageQuerySchema,
      false,
    ),
    post: operation(
      'Create a private task project.',
      spec.taskProjectResponseSchema,
      spec.createTaskProjectBodySchema,
      false,
      undefined,
      true,
    ),
  },
  '/tasks/projects/{id}': {
    patch: operation(
      'Rename a task project with a current version.',
      spec.taskProjectResponseSchema,
      spec.updateTaskProjectBodySchema,
      true,
      undefined,
      false,
    ),
    delete: operation(
      'Delete an empty task project; nonempty projects are protected.',
      spec.planningSuccessResponseSchema,
      undefined,
      true,
      spec.planningDeleteQuerySchema,
      false,
    ),
  },
  '/tasks/items': {
    get: operation(
      'List private tasks by project, inbox, board column, completion and search.',
      spec.taskItemsResponseSchema,
      undefined,
      false,
      spec.taskItemsQuerySchema,
      false,
    ),
    post: operation(
      'Create a task in a project or your inbox; repeating tasks need a due date and start open.',
      spec.taskItemResponseSchema,
      spec.createTaskItemBodySchema,
      false,
      undefined,
      true,
    ),
  },
  '/tasks/items/{id}': {
    patch: operation(
      'Edit or move a task. Completing a repeating task atomically schedules its next occurrence once; omitted fields stay unchanged.',
      spec.taskItemResponseSchema,
      spec.updateTaskItemBodySchema,
      true,
      undefined,
      false,
    ),
    delete: operation(
      'Delete a task using its latest version.',
      spec.planningSuccessResponseSchema,
      undefined,
      true,
      spec.planningDeleteQuerySchema,
      false,
    ),
  },
}
