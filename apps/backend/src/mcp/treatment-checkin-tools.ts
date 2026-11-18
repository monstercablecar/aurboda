import {
  addTreatmentReflectionSchema,
  treatmentCheckinActionSchema,
  treatmentCheckinEntrySchema,
  treatmentCheckinSettingsSchema,
} from '@aurboda/api-spec'
import { z } from 'zod'

import { isHttpError } from '../http-error.ts'
import { treatmentCheckinActions } from '../services/treatment-checkins.ts'
import { jsonResponse, type McpServer } from './helpers.ts'

export const registerTreatmentCheckinTools = (
  server: McpServer,
  user: string,
  actions = treatmentCheckinActions,
): void => {
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return jsonResponse({ success: true, data: await fn() })
    } catch (error) {
      if (isHttpError(error)) {
        return { ...jsonResponse({ success: false, error: error.message }), isError: true }
      }
      throw error
    }
  }
  server.tool(
    'list_treatment_checkins',
    'List personal check-ins, shared assessment history and reminder availability. Never reinterpret a late reflection as an on-time response.',
    { treatment_session_id: z.string().uuid().optional() },
    async (body) => run(() => actions.list(user, body.treatment_session_id)),
  )
  server.tool(
    'add_treatment_reflection',
    'Start a current observation or a later reflection for a session. Does not fill missed windows.',
    addTreatmentReflectionSchema.shape,
    async (body) => run(() => actions.add(user, body)),
  )
  server.tool(
    'update_treatment_checkin_settings',
    'Change opt-in reminders and quiet hours for a session plan.',
    { id: z.string().uuid(), ...treatmentCheckinSettingsSchema.shape },
    async ({ id, ...body }) => run(() => actions.settings(user, id, body)),
  )
  server.tool(
    'save_treatment_checkin_draft',
    'Autosave an unfinished check-in using its latest revision. Does not complete it.',
    { id: z.string().uuid(), ...treatmentCheckinEntrySchema.shape },
    async ({ id, ...body }) => run(() => actions.draft(user, id, body)),
  )
  server.tool(
    'complete_treatment_checkin',
    'Save one shared assessment and complete the check-in atomically. No clinical score or monitoring is implied.',
    { id: z.string().uuid(), ...treatmentCheckinEntrySchema.shape },
    async ({ id, ...body }) => run(() => actions.complete(user, id, body)),
  )
  server.tool(
    'act_on_treatment_checkin',
    'Skip an optional check-in or snooze its next reminder within its window.',
    { id: z.string().uuid(), ...treatmentCheckinActionSchema.shape },
    async ({ id, ...body }) => run(() => actions.action(user, id, body)),
  )
}
