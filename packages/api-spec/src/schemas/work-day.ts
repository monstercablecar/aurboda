import { z } from 'zod'
export const workDayBodySchema = z
  .object({
    profile_id: z.string().min(1).max(200),
    work_date: z.iso.date(),
    timestamp: z.iso.datetime({ offset: true }),
    values: z.record(z.string(), z.record(z.string(), z.number().finite().nonnegative())),
    totals: z.record(z.string(), z.number().finite().nonnegative()),
    note: z.string().max(10000),
  })
  .meta({ id: 'WorkDayBody' })
export const workDayResultSchema = z
  .object({
    activity_id: z.uuid(),
    profile_id: z.string(),
    work_date: z.iso.date(),
    timestamp: z.iso.datetime(),
    metric_count: z.number().int(),
  })
  .meta({ id: 'WorkDayResult' })
export const workDayResponseSchema = z
  .object({ success: z.boolean(), data: workDayResultSchema.optional(), error: z.string().optional() })
  .meta({ id: 'WorkDayResponse' })
export type WorkDayBody = z.infer<typeof workDayBodySchema>
export type WorkDayResult = z.infer<typeof workDayResultSchema>
export type WorkDayResponse = z.infer<typeof workDayResponseSchema>
