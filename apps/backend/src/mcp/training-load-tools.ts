import { getTrainingLoadInputSchema, tzSchema } from '@aurboda/api-spec'

import { computeTrainingLoad, createTrainingLoadDeps } from '../services/training-load/index.ts'
import { jsonResponse, type McpServer, tzJsonResponse } from './helpers.ts'

export const registerTrainingLoadTools = (server: McpServer, user: string) => {
  const deps = createTrainingLoadDeps()

  server.tool(
    'get_training_load',
    `Compute training load using the Banister impulse-response model with hourly resolution.

Returns modeled short-term load (ATL, default 7-day EMA), long-term load (CTL, default 42-day EMA),
and their difference (TSB = CTL - ATL), plus per-hour training impulse (exercise TRIMP),
activity impulse (scaled active calories), and per-workout TRIMP scores.

Two impulse sources per hour:
- training_impulse: TRIMP from exercise sessions (HR-based Banister formula or duration fallback)
- activity_impulse: active calories × scale factor (general movement load)

Each workout has trimp_basis: "hr" (from its average heart rate) or "duration_estimate" (no usable heart rate,
so duration × 0.5, a guess). estimated_impulse sums the workouts in the range: how many are estimated and what
share of their TRIMP (estimated_share) is estimated. When that share is high, say CTL/ATL/TSB are mostly guessed.

Source coverage is unknown: absent hours may be inactivity or missing recordings. Generated zero-filled
lookback hours are not observed history. bootstrapping remains true and optional model bands (zones) are
omitted until sufficient observed coverage can be established. These numbers do not measure recovery,
readiness, injury risk, felt fatigue or fitness; positive TSB does not justify a hard training session.

Parameters can be configured in user settings (training_load).

Example: "Show my training load for the last 3 months"
→ start: 3 months ago, end: today`,
    { ...getTrainingLoadInputSchema.shape, tz: tzSchema },
    async ({ start, end, bucket_size, tz }) => {
      try {
        const result = await computeTrainingLoad(deps, user, new Date(start), new Date(end), bucket_size, tz)
        return tzJsonResponse({ data: result, success: true }, tz)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return jsonResponse({ error: message, success: false })
      }
    },
  )
}
