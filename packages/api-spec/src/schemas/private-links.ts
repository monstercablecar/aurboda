import { z } from 'zod'

export const privateLinkTargetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['person', 'activity']),
  name: z.string(),
})
export const privateLinkTargetsQuerySchema = z.object({ search: z.string().max(200).default('') })
export const privateLinkTargetsResponseSchema = z
  .object({ success: z.literal(true), data: z.array(privateLinkTargetSchema) })
  .meta({ id: 'PrivateLinkTargetsResponse' })
export const setActivityPeopleBodySchema = z
  .object({ person_ids: z.array(z.uuid()).max(100), activity_ids: z.array(z.uuid()).max(99).optional() })
  .meta({ id: 'SetActivityPeopleBody' })
export const privateActivityPeopleQuerySchema = z.object({ activity_ids: z.string().max(4000).optional() })
export type PrivateActivityPeopleQuery = z.infer<typeof privateActivityPeopleQuerySchema>
export const activityPeopleResponseSchema = z
  .object({ success: z.literal(true), data: z.array(privateLinkTargetSchema) })
  .meta({ id: 'ActivityPeopleResponse' })
export const personTimeWithQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    timezone: z.string().max(100).default('UTC'),
    metric: z.string().max(200).optional(),
  })
  .meta({ id: 'PersonTimeWithQuery' })
export const personTimeWithResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      person_id: z.uuid(),
      metric_aggregation: z.enum(['avg', 'sum']).nullable(),
      days: z.array(
        z.object({ date: z.iso.date(), minutes: z.number(), metric_value: z.number().nullable() }),
      ),
      activities: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          start_time: z.iso.datetime(),
          end_time: z.iso.datetime().nullable(),
        }),
      ),
      total_minutes: z.number(),
      correlation: z.number().nullable(),
      paired_days: z.number(),
    }),
  })
  .meta({ id: 'PersonTimeWithResponse' })
export type SetActivityPeopleBody = z.infer<typeof setActivityPeopleBodySchema>
export type PrivateLinkTarget = z.infer<typeof privateLinkTargetSchema>
export type PrivateLinkTargetsQuery = z.infer<typeof privateLinkTargetsQuerySchema>
export type PrivateLinkTargetsResponse = z.infer<typeof privateLinkTargetsResponseSchema>
export type ActivityPeopleResponse = z.infer<typeof activityPeopleResponseSchema>
export type PersonTimeWithQuery = z.infer<typeof personTimeWithQuerySchema>
export type PersonTimeWithResponse = z.infer<typeof personTimeWithResponseSchema>
