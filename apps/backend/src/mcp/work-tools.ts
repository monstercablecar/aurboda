import { workDayBodySchema } from '@aurboda/api-spec'

import type { ActivityNotifier } from '../services/deduction-queue.ts'

import { saveWorkDay } from '../services/work-day.ts'
import { jsonResponse, type McpServer } from './helpers.ts'
export const registerWorkTools = (server: McpServer, user: string, onMutated?: ActivityNotifier) => {
  server.tool(
    'set_work_day',
    'Atomically save the configured Work grid, validated totals, note and day entry. Retries preserve the canonical activity and timestamp.',
    { ...workDayBodySchema.shape },
    async (body) => jsonResponse({ success: true, data: await saveWorkDay(user, body, onMutated) }),
  )
}
