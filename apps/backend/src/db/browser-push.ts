import type { BrowserPushSubscription } from '@aurboda/api-spec'

import { query } from './connection.ts'

export const saveBrowserPush = async (
  user: string,
  subscription: BrowserPushSubscription,
): Promise<string> => {
  const result = await query<{ id: string }>(
    user,
    `INSERT INTO browser_push_subscriptions (endpoint, keys) VALUES ($1, $2)
     ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys, updated_at = NOW() RETURNING id`,
    [subscription.endpoint, JSON.stringify(subscription.keys)],
  )
  return result.rows[0].id
}

export const getBrowserPush = async (user: string, id: string): Promise<BrowserPushSubscription | null> => {
  const result = await query<BrowserPushSubscription>(
    user,
    'SELECT endpoint, keys FROM browser_push_subscriptions WHERE id = $1',
    [id],
  )
  return result.rows[0] ?? null
}

export const deleteBrowserPush = async (user: string, id: string): Promise<boolean> => {
  const result = await query(user, 'DELETE FROM browser_push_subscriptions WHERE id = $1', [id])
  return (result.rowCount ?? 0) > 0
}

export const listBrowserPush = async (user: string): Promise<(BrowserPushSubscription & { id: string })[]> =>
  (
    await query<BrowserPushSubscription & { id: string }>(
      user,
      'SELECT id, endpoint, keys FROM browser_push_subscriptions',
    )
  ).rows
