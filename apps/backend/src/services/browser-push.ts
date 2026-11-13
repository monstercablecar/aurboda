import type { BrowserPushSubscription } from '@aurboda/api-spec'

import { browserPushSubscriptionSchema } from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
import * as webpush from 'web-push'

import { deleteBrowserPush, getBrowserPush, listBrowserPush, saveBrowserPush } from '../db/browser-push.ts'
import { httpError } from '../http-error.ts'

interface PushConfiguration {
  publicKey: string
  privateKey: string
  subject: string
}
export const browserPushConfiguration = (): PushConfiguration | null => {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
}

const send = async (subscription: BrowserPushSubscription, config: PushConfiguration) => {
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: 'Aurboda Test',
      body: 'Notifications are working.',
      tag: randomUUID(),
    }),
    { vapidDetails: config, TTL: 60, timeout: 5000 },
  )
}

export const createBrowserPushService = (
  deps = {
    configuration: browserPushConfiguration,
    save: saveBrowserPush,
    get: getBrowserPush,
    remove: deleteBrowserPush,
    send,
  },
) => {
  const configured = () => {
    const config = deps.configuration()
    if (!config) throw httpError(503, 'Browser notifications are not configured on this server.')
    return config
  }
  return {
    publicKey: () => configured().publicKey,
    register: async (user: string, subscription: BrowserPushSubscription) => {
      configured()
      const parsed = browserPushSubscriptionSchema.safeParse(subscription)
      if (!parsed.success) throw httpError(400, 'Unsupported browser push subscription.')
      return deps.save(user, parsed.data)
    },
    remove: async (user: string, id: string) => {
      if (!(await deps.remove(user, id))) throw httpError(404, 'Browser subscription not found.')
    },
    test: async (user: string, id: string) => {
      const config = configured()
      const subscription = await deps.get(user, id)
      if (!subscription) throw httpError(404, 'Browser subscription not found.')
      if (!browserPushSubscriptionSchema.safeParse(subscription).success) {
        throw httpError(400, 'Unsupported browser push subscription.')
      }
      try {
        await deps.send(subscription, config)
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
        if (status === 404 || status === 410) {
          await deps.remove(user, id)
          throw httpError(410, 'Browser subscription expired. Enable notifications again.')
        }
        throw httpError(502, 'Push service did not accept the test. Try again later.')
      }
      return { accepted: true as const }
    },
  }
}

export const peopleReminderPayload = (id: string) => ({
  kind: 'people_reminder' as const,
  title: 'Aurboda reminder',
  body: 'You have a reminder in People.',
  tag: id,
})

export const createPeopleReminderSender =
  (
    deps = {
      configuration: browserPushConfiguration,
      list: listBrowserPush,
      remove: deleteBrowserPush,
      send: async (
        subscription: BrowserPushSubscription,
        config: PushConfiguration,
        payload: ReturnType<typeof peopleReminderPayload>,
      ) => {
        await webpush.sendNotification(subscription, JSON.stringify(payload), {
          vapidDetails: config,
          TTL: 300,
          timeout: 5000,
        })
      },
    },
  ) =>
  async (user: string, id: string): Promise<'accepted' | 'unavailable' | 'retry'> => {
    const config = deps.configuration()
    if (!config) return 'unavailable'
    const subscriptions = await deps.list(user)
    if (!subscriptions.length) return 'unavailable'
    const outcomes = await Promise.all(
      subscriptions.map(async (subscription) => {
        if (
          !browserPushSubscriptionSchema.safeParse({
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          }).success
        ) {
          return 'unavailable'
        }
        try {
          await deps.send(subscription, config, peopleReminderPayload(id))
          return 'accepted'
        } catch (error) {
          const status =
            error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
          if (status === 404 || status === 410) {
            try {
              await deps.remove(user, subscription.id)
            } catch {
              // A failed cleanup must not retry a notification already accepted by another device.
            }
            return 'unavailable'
          }
          return 'retry'
        }
      }),
    )
    return outcomes.includes('accepted') ? 'accepted' : outcomes.includes('retry') ? 'retry' : 'unavailable'
  }
