import { z } from 'zod'

import { successSchema } from './common.ts'

export const revokeOAuthConnectionBodySchema = z
  .object({
    client_id: z.string().min(1).max(255),
  })
  .strict()
  .meta({ id: 'RevokeOAuthConnectionBody' })
export type RevokeOAuthConnectionBody = z.infer<typeof revokeOAuthConnectionBodySchema>

export const oauthConnectionsResponseSchema = z
  .object({
    success: successSchema,
    connections: z.array(
      z.object({
        client_id: z.string(),
        client_name: z.string(),
        scope: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'OAuthConnectionsResponse' })
export type OAuthConnectionsResponse = z.infer<typeof oauthConnectionsResponseSchema>
