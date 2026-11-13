import { z } from 'zod'

export const planningDateSchema = z.iso.date()
export const planningVersionSchema = z.iso.datetime({ offset: true })
export const planningIdSchema = z.uuid()
export const planningPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
})
export type PlanningPageQuery = z.infer<typeof planningPageQuerySchema>
export const planningDeleteQuerySchema = z.object({ expected_updated_at: planningVersionSchema })
export type PlanningDeleteQuery = z.infer<typeof planningDeleteQuerySchema>

export const planningSuccessResponseSchema = z
  .object({ success: z.literal(true) })
  .meta({ id: 'PlanningSuccessResponse', description: 'Successful private planning operation.' })
export type PlanningSuccessResponse = z.infer<typeof planningSuccessResponseSchema>
