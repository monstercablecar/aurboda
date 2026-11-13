import { z } from 'zod'

export const browserPushEndpointSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      const host = url.hostname
      const authority = value.slice(8).split(/[/?#]/, 1)[0]
      return (
        url.protocol === 'https:' &&
        !authority.includes(':') &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.hash &&
        (host === 'fcm.googleapis.com' ||
          host === 'updates.push.services.mozilla.com' ||
          host === 'web.push.apple.com' ||
          host.endsWith('.push.apple.com'))
      )
    } catch {
      return false
    }
  }, 'Unsupported browser push endpoint')

export const browserPushSubscriptionSchema = z
  .object({
    endpoint: browserPushEndpointSchema,
    keys: z
      .object({
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
      })
      .strict(),
  })
  .strict()
  .meta({ id: 'BrowserPushSubscription', description: 'Current browser push subscription credentials' })

export const browserPushTargetSchema = z
  .object({ subscription_id: z.uuid() })
  .strict()
  .meta({ id: 'BrowserPushTarget', description: 'Current browser subscription identifier' })

export const browserPushResponseSchema = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    public_key: z.string().optional(),
    subscription_id: z.uuid().optional(),
    accepted: z.boolean().optional(),
  })
  .meta({
    id: 'BrowserPushResponse',
    description: 'Push operation result; accepted does not confirm delivery',
  })

export type BrowserPushSubscription = z.infer<typeof browserPushSubscriptionSchema>
export type BrowserPushTarget = z.infer<typeof browserPushTargetSchema>
export type BrowserPushResponse = z.infer<typeof browserPushResponseSchema>
