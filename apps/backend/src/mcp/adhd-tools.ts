import { adhdCommandBodySchema } from '@aurboda/api-spec'

import { adhdService } from '../services/adhd.ts'
import { jsonResponse, type McpServer } from './helpers.ts'

export const registerAdhdTools = (server: McpServer, user: string) => {
  server.tool(
    'get_adhd',
    'Read private ADHD observations, protocols and source-separated history for the authenticated account.',
    {},
    async () => jsonResponse(await adhdService.state(user)),
  )
  server.tool(
    'export_adhd',
    'Export private ADHD definitions, canonical observations, outcomes and missingness. Do not publish this content.',
    {},
    async () => jsonResponse(await adhdService.state(user)),
  )
  server.tool(
    'set_adhd',
    'Perform an explicitly requested user action. Never invent observations or silently activate a protocol. Stable request_id must survive uncertain retries. Private and account-scoped.',
    { ...adhdCommandBodySchema.shape },
    async (params) =>
      jsonResponse({ result_id: await adhdService.command(user, adhdCommandBodySchema.parse(params)) }),
  )
}
