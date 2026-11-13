import * as spec from '@aurboda/api-spec'

import * as service from '../services/native-tasks.ts'
import { typedRouter, type AnyMiddleware } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

export const createNativeTasksRouter = (auth: AnyMiddleware) => {
  const router = typedRouter()
  router.get<Record<string, never>, spec.TaskBoardResponse>('/board', auth, async (req, res) => {
    res.json({ success: true, data: await service.getTaskBoard(req.user!) })
  })
  router.patch<Record<string, never>, spec.TaskBoardResponse, spec.UpdateTaskBoardBody>(
    '/board',
    auth,
    validateBody(spec.updateTaskBoardBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await service.updateTaskBoard(req.user!, req.body) })
    },
  )
  router.get<Record<string, never>, spec.TaskProjectsResponse, unknown, spec.PlanningPageQuery>(
    '/projects',
    auth,
    validateQuery(spec.planningPageQuerySchema),
    async (req, res) => {
      res.json(await service.listTaskProjects(req.user!, req.query))
    },
  )
  router.post<Record<string, never>, spec.TaskProjectResponse, spec.CreateTaskProjectBody>(
    '/projects',
    auth,
    validateBody(spec.createTaskProjectBodySchema),
    async (req, res) => {
      res.status(201).json({ success: true, data: await service.createTaskProject(req.user!, req.body) })
    },
  )
  router.patch<{ id: string }, spec.TaskProjectResponse, spec.UpdateTaskProjectBody>(
    '/projects/:id',
    auth,
    validateBody(spec.updateTaskProjectBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await service.updateTaskProject(req.user!, req.params.id, req.body) })
    },
  )
  router.delete<{ id: string }, spec.PlanningSuccessResponse, unknown, spec.PlanningDeleteQuery>(
    '/projects/:id',
    auth,
    validateQuery(spec.planningDeleteQuerySchema),
    async (req, res) => {
      await service.deleteTaskProject(req.user!, req.params.id, req.query.expected_updated_at)
      res.json({ success: true })
    },
  )
  router.get<Record<string, never>, spec.TaskItemsResponse, unknown, spec.TaskItemsQuery>(
    '/items',
    auth,
    validateQuery(spec.taskItemsQuerySchema),
    async (req, res) => {
      res.json(await service.listTaskItems(req.user!, req.query))
    },
  )
  router.post<Record<string, never>, spec.TaskItemResponse, spec.CreateTaskItemBody>(
    '/items',
    auth,
    validateBody(spec.createTaskItemBodySchema),
    async (req, res) => {
      res.status(201).json({ success: true, data: await service.createTaskItem(req.user!, req.body) })
    },
  )
  router.patch<{ id: string }, spec.TaskItemResponse, spec.UpdateTaskItemBody>(
    '/items/:id',
    auth,
    validateBody(spec.updateTaskItemBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await service.updateTaskItem(req.user!, req.params.id, req.body) })
    },
  )
  router.delete<{ id: string }, spec.PlanningSuccessResponse, unknown, spec.PlanningDeleteQuery>(
    '/items/:id',
    auth,
    validateQuery(spec.planningDeleteQuerySchema),
    async (req, res) => {
      await service.deleteTaskItem(req.user!, req.params.id, req.query.expected_updated_at)
      res.json({ success: true })
    },
  )
  return router
}
