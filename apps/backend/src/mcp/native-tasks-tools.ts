import * as spec from '@aurboda/api-spec'

import * as tasks from '../services/native-tasks.ts'
import { jsonResponse, type McpServer } from './helpers.ts'

export const registerNativeTasksTools = (server: McpServer, user: string) => {
  server.tool('get_task_board', 'Read your private board columns and advisory WIP limits.', {}, async () =>
    jsonResponse({ success: true, data: await tasks.getTaskBoard(user) }),
  )
  server.tool(
    'update_task_board',
    'Update board columns; move tasks first before removing columns or changing completion category.',
    spec.updateTaskBoardBodySchema.shape,
    async (body) => jsonResponse({ success: true, data: await tasks.updateTaskBoard(user, body) }),
  )
  server.tool(
    'list_task_projects',
    'List your private task projects.',
    spec.planningPageQuerySchema.shape,
    async (body) => {
      return jsonResponse(await tasks.listTaskProjects(user, body))
    },
  )
  server.tool(
    'create_task_project',
    'Create a private task project.',
    spec.createTaskProjectBodySchema.shape,
    async (body) => {
      return jsonResponse({ success: true, data: await tasks.createTaskProject(user, body) })
    },
  )
  server.tool(
    'update_task_project',
    'Rename a task project with a current version.',
    { id: spec.planningIdSchema, ...spec.updateTaskProjectBodySchema.shape },
    async ({ id, ...body }) => {
      return jsonResponse({ success: true, data: await tasks.updateTaskProject(user, id, body) })
    },
  )
  server.tool(
    'delete_task_project',
    'Delete an empty task project; nonempty projects are protected.',
    { id: spec.planningIdSchema, ...spec.planningDeleteQuerySchema.shape },
    async ({ id, ...body }) => {
      await tasks.deleteTaskProject(user, id, body.expected_updated_at)
      return jsonResponse({ success: true })
    },
  )
  server.tool(
    'list_task_items',
    'List private tasks by project, inbox, board column, completion and search.',
    spec.taskItemsQuerySchema.shape,
    async (body) => {
      return jsonResponse(await tasks.listTaskItems(user, body))
    },
  )
  server.tool(
    'create_task_item',
    'Create a task in a project or your inbox; repeating tasks need a due date and start open.',
    spec.createTaskItemBodySchema.shape,
    async (body) => {
      return jsonResponse({ success: true, data: await tasks.createTaskItem(user, body) })
    },
  )
  server.tool(
    'update_task_item',
    'Edit or move a task. Completing a repeating task atomically schedules its next occurrence once; omitted fields stay unchanged.',
    { id: spec.planningIdSchema, ...spec.updateTaskItemBodySchema.shape },
    async ({ id, ...body }) => {
      return jsonResponse({ success: true, data: await tasks.updateTaskItem(user, id, body) })
    },
  )
  server.tool(
    'delete_task_item',
    'Delete a task using its latest version.',
    { id: spec.planningIdSchema, ...spec.planningDeleteQuerySchema.shape },
    async ({ id, ...body }) => {
      await tasks.deleteTaskItem(user, id, body.expected_updated_at)
      return jsonResponse({ success: true })
    },
  )
}
