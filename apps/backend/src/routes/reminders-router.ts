import {
  addReminderBodySchema,
  updateReminderBodySchema,
  type AddReminderBody,
  type UpdateReminderBody,
  type ReminderResponse,
  type RemindersResponse,
  type ReminderTestResponse,
  type BaseResponse,
  UUID_RE,
} from '@aurboda/api-spec'

import { isHttpError } from '../http-error.ts'
import { reminderActions } from '../services/reminders.ts'
import { type AnyMiddleware, type TypedRouter, typedRouter } from '../typed-router.ts'
import { validateBody } from '../validation.ts'

export const createRemindersRouter = (
  authMiddleware: AnyMiddleware,
  actions = reminderActions,
): TypedRouter => {
  const router = typedRouter()
  router.get<Record<string, never>, RemindersResponse>('/', authMiddleware, async (req, res) => {
    res.json({ success: true, reminders: await actions.list(req.user!), scheduler_ready: actions.ready() })
  })
  router.post<Record<string, never>, ReminderResponse, AddReminderBody>(
    '/',
    authMiddleware,
    validateBody(addReminderBodySchema),
    async (req, res) => {
      try {
        res.json({ success: true, reminder: await actions.add(req.user!, req.body) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.patch<{ id: string }, ReminderResponse, UpdateReminderBody>(
    '/:id',
    authMiddleware,
    validateBody(updateReminderBodySchema),
    async (req, res) => {
      if (!UUID_RE.test(req.params.id)) {
        return res.status(404).json({ success: false, error: 'Reminder not found.' })
      }
      try {
        res.json({ success: true, reminder: await actions.change(req.user!, req.params.id, req.body) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.delete<{ id: string }, BaseResponse>('/:id', authMiddleware, async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Reminder not found.' })
    }
    try {
      await actions.remove(req.user!, req.params.id)
      res.json({ success: true })
    } catch (error) {
      if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
      throw error
    }
  })
  router.post<{ id: string }, ReminderTestResponse>('/:id/test', authMiddleware, async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).json({ success: false, queued: false, error: 'Reminder not found.' })
    }
    try {
      res.json({ success: true, queued: await actions.test(req.user!, req.params.id) })
    } catch (error) {
      if (isHttpError(error)) {
        return res.status(error.status).json({ success: false, queued: false, error: error.message })
      }
      throw error
    }
  })
  return router
}
