import { z } from 'zod'

import { baseResponseSchema, iso8601DateTimeSchema } from './common.ts'

const reminderFields = {
  title: z.string().trim().min(1).max(120),
  time_of_day: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value })
        return true
      } catch {
        return false
      }
    }, 'Use a valid timezone'),
  recurrence: z.enum(['once', 'daily', 'weekdays', 'weekly']),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T12:00:00Z`)
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    }, 'Use a valid calendar date'),
  enabled: z.boolean(),
  link: z
    .string()
    .max(500)
    .regex(/^\/(?!\/)[^\\\u0000-\u0020]*$/)
    .nullable(),
}

export const addReminderBodySchema = z.object(reminderFields).strict().meta({
  id: 'AddReminderBody',
  description: 'A private reminder in a fixed timezone. Weekly repeats on the start date weekday.',
})
export type AddReminderBody = z.infer<typeof addReminderBodySchema>
export const updateReminderBodySchema = addReminderBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a change')
  .meta({ id: 'UpdateReminderBody' })
export type UpdateReminderBody = z.infer<typeof updateReminderBodySchema>
export const reminderSchema = z
  .object({
    ...reminderFields,
    id: z.string().uuid(),
    next_due_at: iso8601DateTimeSchema.nullable(),
    created_at: iso8601DateTimeSchema,
    updated_at: iso8601DateTimeSchema,
  })
  .meta({ id: 'Reminder' })
export type Reminder = z.infer<typeof reminderSchema>
export const remindersResponseSchema = baseResponseSchema
  .extend({ reminders: z.array(reminderSchema), scheduler_ready: z.boolean() })
  .meta({ id: 'RemindersResponse' })
export type RemindersResponse = z.infer<typeof remindersResponseSchema>
export const reminderResponseSchema = baseResponseSchema
  .extend({ reminder: reminderSchema.optional() })
  .meta({ id: 'ReminderResponse' })
export type ReminderResponse = z.infer<typeof reminderResponseSchema>
export const reminderTestResponseSchema = baseResponseSchema
  .extend({ queued: z.boolean() })
  .meta({ id: 'ReminderTestResponse' })
export type ReminderTestResponse = z.infer<typeof reminderTestResponseSchema>
