import type { Response } from 'express'

import {
  type BrowserPushResponse,
  type BrowserPushSubscription,
  type BrowserPushTarget,
  browserPushSubscriptionSchema,
  browserPushTargetSchema,
} from '@aurboda/api-spec'

import { httpError, isHttpError } from '../http-error.ts'
import { createBrowserPushService } from '../services/browser-push.ts'
import { type AnyMiddleware, typedRouter } from '../typed-router.ts'
import { validateBody } from '../validation.ts'

const requireUser = (user: string | undefined): string => {
  if (!user) throw httpError(401, 'Authentication required.')
  return user
}

export const createBrowserPushRouter = (
  authMiddleware: AnyMiddleware,
  service = createBrowserPushService(),
) => {
  const router = typedRouter()
  router.use(authMiddleware)
  router.use((req, res, next) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required.' })
      return
    }
    next()
  })
  router.get<Record<string, never>, BrowserPushResponse>('/public-key', (_req, res) => {
    res.json({ success: true, public_key: service.publicKey() })
  })
  router.post<Record<string, never>, BrowserPushResponse, BrowserPushSubscription>(
    '/subscription',
    validateBody(browserPushSubscriptionSchema),
    async (req, res) => {
      const subscription_id = await service.register(requireUser(req.user), req.body)
      res.json({ success: true, subscription_id })
    },
  )
  router.delete<Record<string, never>, BrowserPushResponse, BrowserPushTarget>(
    '/subscription',
    validateBody(browserPushTargetSchema),
    async (req, res) => {
      await service.remove(requireUser(req.user), req.body.subscription_id)
      res.json({ success: true })
    },
  )
  router.post<Record<string, never>, BrowserPushResponse, BrowserPushTarget>(
    '/test',
    validateBody(browserPushTargetSchema),
    async (req, res) => {
      const result = await service.test(requireUser(req.user), req.body.subscription_id)
      res.json({ success: true, ...result })
    },
  )
  router.use((error: unknown, _req: unknown, res: Response<BrowserPushResponse>, _next: unknown) => {
    res.status(isHttpError(error) ? error.status : 500).json({
      success: false,
      error: isHttpError(error) ? error.message : 'Browser notification request failed.',
    })
  })
  return router
}
