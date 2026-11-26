import { adhdCommandBodySchema, type AdhdCommandBody, type AdhdResponse } from '@aurboda/api-spec'

import { adhdService } from '../services/adhd.ts'
import { typedRouter, type AnyMiddleware } from '../typed-router.ts'
import { validateBody } from '../validation.ts'

export const createAdhdRouter = (auth: AnyMiddleware, service = adhdService) => {
  const router = typedRouter()
  router.get<Record<string, never>, AdhdResponse>('/', auth, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ success: true, data: await service.state(req.user!) })
  })
  router.get<Record<string, never>, AdhdResponse>('/export', auth, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Disposition', 'attachment; filename="adhd-private-export.json"')
    res.json({ success: true, data: await service.state(req.user!) })
  })
  router.post<Record<string, never>, AdhdResponse, AdhdCommandBody>(
    '/commands',
    auth,
    validateBody(adhdCommandBodySchema),
    async (req, res) => {
      const result_id = await service.command(req.user!, req.body)
      res.setHeader('Cache-Control', 'private, no-store')
      res.json({ success: true, result_id, data: await service.state(req.user!) })
    },
  )
  return router
}
