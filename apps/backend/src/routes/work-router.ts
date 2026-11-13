import type { RequestHandler } from 'express'

import { workDayBodySchema, type WorkDayBody, type WorkDayResponse } from '@aurboda/api-spec'

import type { ActivityNotifier } from '../services/deduction-queue.ts'

import { saveWorkDay } from '../services/work-day.ts'
import { typedRouter } from '../typed-router.ts'
import { validateBody } from '../validation.ts'
export const createWorkRouter = (auth: RequestHandler, onMutated?: ActivityNotifier) => {
  const router = typedRouter()
  router.post<Record<string, never>, WorkDayResponse, WorkDayBody>(
    '/days',
    auth,
    validateBody(workDayBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await saveWorkDay(req.user!, req.body, onMutated) })
    },
  )
  return router
}
