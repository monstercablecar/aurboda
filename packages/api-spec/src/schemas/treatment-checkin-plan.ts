import { z } from 'zod'

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const treatmentCheckinPlanBodySchema = z
  .object({
    before: z.boolean().default(true),
    after: z.boolean().default(true),
    next_day: z.boolean().default(true),
    later_hours: z.number().int().min(48).max(720).nullable().default(null),
    reminders_enabled: z.boolean().default(false),
    quiet_start: clockTime.default('21:00'),
    quiet_end: clockTime.default('08:00'),
    additional: z
      .array(
        z.object({
          template_id: z.string().uuid(),
          offset_hours: z.number().int().min(0).max(8760),
          window_hours: z.number().int().min(1).max(720),
        }),
      )
      .max(12)
      .default([]),
    personal_goal: z.string().trim().max(200).default(''),
  })
  .meta({
    id: 'TreatmentCheckinPlanBody',
    description: 'Optional personal journal plan. Times are product defaults, not clinical instructions.',
  })
export type TreatmentCheckinPlanBody = z.infer<typeof treatmentCheckinPlanBodySchema>
export const treatmentCheckinSettingsSchema = z
  .object({
    reminders_enabled: z.boolean().optional(),
    quiet_start: clockTime.optional(),
    quiet_end: clockTime.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide a reminder preference change.')
  .meta({ id: 'TreatmentCheckinSettings', description: 'Change reminder preferences for an existing plan.' })
export type TreatmentCheckinSettings = z.infer<typeof treatmentCheckinSettingsSchema>
