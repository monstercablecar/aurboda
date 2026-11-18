import {
  addTreatmentReflectionSchema,
  treatmentCheckinActionSchema,
  treatmentCheckinEntrySchema,
  treatmentCheckinSettingsSchema,
  type AddTreatmentReflection,
  type BaseResponse,
  type TreatmentCheckinAction,
  type TreatmentCheckinEntry,
  type TreatmentCheckinResponse,
  type TreatmentCheckinsResponse,
  type TreatmentCheckinSettings,
} from '@aurboda/api-spec'

import { isHttpError } from '../http-error.ts'
import { treatmentCheckinActions } from '../services/treatment-checkins.ts'
import { type AnyMiddleware, type TypedRouter, typedRouter } from '../typed-router.ts'
import { validateBody } from '../validation.ts'

export const createTreatmentCheckinsRouter = (
  auth: AnyMiddleware,
  actions = treatmentCheckinActions,
): TypedRouter => {
  const router = typedRouter()
  router.get<Record<string, never>, TreatmentCheckinsResponse, unknown, { treatment_session_id?: string }>(
    '/',
    auth,
    async (req, res) => {
      try {
        res.json({ success: true, ...(await actions.list(req.user!, req.query.treatment_session_id)) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.post<Record<string, never>, TreatmentCheckinResponse, AddTreatmentReflection>(
    '/',
    auth,
    validateBody(addTreatmentReflectionSchema),
    async (req, res) => {
      try {
        res.status(201).json({ success: true, data: await actions.add(req.user!, req.body) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.patch<{ id: string }, BaseResponse, TreatmentCheckinSettings>(
    '/plans/:id',
    auth,
    validateBody(treatmentCheckinSettingsSchema),
    async (req, res) => {
      try {
        await actions.settings(req.user!, req.params.id, req.body)
        res.json({ success: true })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.put<{ id: string }, TreatmentCheckinResponse, TreatmentCheckinEntry>(
    '/:id/draft',
    auth,
    validateBody(treatmentCheckinEntrySchema),
    async (req, res) => {
      try {
        res.json({ success: true, data: await actions.draft(req.user!, req.params.id, req.body) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.post<{ id: string }, TreatmentCheckinResponse, TreatmentCheckinEntry>(
    '/:id/complete',
    auth,
    validateBody(treatmentCheckinEntrySchema),
    async (req, res) => {
      try {
        res.json({ success: true, data: await actions.complete(req.user!, req.params.id, req.body) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  router.post<{ id: string }, TreatmentCheckinResponse, TreatmentCheckinAction>(
    '/:id/action',
    auth,
    validateBody(treatmentCheckinActionSchema),
    async (req, res) => {
      try {
        res.json({ success: true, data: await actions.action(req.user!, req.params.id, req.body) })
      } catch (error) {
        if (isHttpError(error)) return res.status(error.status).json({ success: false, error: error.message })
        throw error
      }
    },
  )
  return router
}
