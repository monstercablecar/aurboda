import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'

import { saveBrowserPush, deleteBrowserPush } from '../db/browser-push.ts'
import { query } from '../db/connection.ts'
import { listDuePeopleReminders, withPeopleReminderClaim } from '../db/people-reminders.ts'
import { startTestDb, stopTestDb, getTestUser, cleanTestDb } from '../test/db-test-helper.ts'
import { deliverBrowserNotifications, enqueuePeopleReminders } from './notification-coordinator.ts'
import { notifier } from './notifications.ts'
const user = getTestUser()
beforeAll(startTestDb, 120000)
afterAll(stopTestDb, 60000)
beforeEach(async () => {
  await cleanTestDb()
  await query(user, 'TRUNCATE browser_push_subscriptions,people CASCADE')
})
const subscription = () =>
  saveBrowserPush(user, {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-notification',
    keys: {
      auth: 'AAAAAAAAAAAAAAAAAAAAAA',
      p256dh: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
  })
test('browser dispatch follows a committed per-subscription claim and concurrent sweeps send once', async () => {
  const id = await subscription(),
    n = await notifier.raise(user, {
      type: 'reminder',
      title: 'Synthetic private title',
      body: 'Private content',
      dedupe_key: 'synthetic-delivery',
    })
  const send = vi.fn(async () => {
    const row = (
      await query<{ attempts: number }>(
        user,
        'SELECT attempts FROM notification_browser_deliveries WHERE notification_id=$1 AND subscription_id=$2',
        [n!.id, id],
      )
    ).rows[0]
    expect(row!.attempts).toBe(1)
    return 'accepted' as const
  })
  await Promise.all([
    deliverBrowserNotifications(user, new Date(), send),
    deliverBrowserNotifications(user, new Date(), send),
  ])
  expect(send).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledWith(user, id, n!.id)
  expect(
    (await query<{ status: string }>(user, 'SELECT status FROM notification_browser_deliveries')).rows[0]!
      .status,
  ).toBe('delivered')
})
test('read, muted or logged-out subscriptions are not delivered; transient delivery retries are bounded', async () => {
  const id = await subscription(),
    n = await notifier.raise(user, { type: 'reminder', title: 'Synthetic', dedupe_key: 'retry' }),
    now = new Date()
  const retry = vi.fn(async () => 'retry' as const)
  await deliverBrowserNotifications(user, now, retry)
  await deliverBrowserNotifications(user, now, retry)
  expect(retry).toHaveBeenCalledTimes(1)
  await deliverBrowserNotifications(user, new Date(now.getTime() + 6 * 60000), retry)
  expect(retry).toHaveBeenCalledTimes(2)
  await query(user, "INSERT INTO notification_preferences(type,push) VALUES('reminder',false)")
  await deliverBrowserNotifications(user, new Date(now.getTime() + 12 * 60000), retry)
  expect(retry).toHaveBeenCalledTimes(2)
  await query(user, 'UPDATE notification_preferences SET push=true')
  await query(user, 'UPDATE notifications SET read_at=NOW() WHERE id=$1', [n!.id])
  await deliverBrowserNotifications(user, new Date(now.getTime() + 18 * 60000), retry)
  expect(retry).toHaveBeenCalledTimes(2)
  await deleteBrowserPush(user, id)
  expect((await query(user, 'SELECT * FROM notification_browser_deliveries')).rowCount).toBe(0)
})
test('old People worker and the coordinator share revision/occurrence claims', async () => {
  const person = randomUUID(),
    event = randomUUID(),
    now = new Date(),
    due = new Date(now.getTime() - 60000).toISOString()
  await query(user, 'INSERT INTO people(id,profile) VALUES($1,$2)', [
    person,
    { name: 'Synthetic private name' },
  ])
  await query(user, 'INSERT INTO people_events(id,person_id,actor,event) VALUES($1,$2,$3,$4)', [
    event,
    person,
    user,
    {
      type: 'contact',
      timestamp: due,
      reminder_at: due,
      reminder_timezone: 'UTC',
      payload: { note: 'Never in a push payload' },
    },
  ])
  const candidate = (await listDuePeopleReminders(user, now))[0]!,
    oldSend = vi.fn(async () => 'accepted' as const)
  await Promise.all([
    enqueuePeopleReminders(user, now),
    withPeopleReminderClaim(user, candidate, now, oldSend),
  ])
  const notifications = await query<{ title: string; body: string | null }>(
    user,
    "SELECT title,body FROM notifications WHERE type='people_event'",
  )
  expect(notifications.rowCount! + oldSend.mock.calls.length).toBe(1)
  for (const n of notifications.rows) {
    expect(n.title).toBe('People reminder')
    expect(n.body).toBeNull()
  }
  await enqueuePeopleReminders(user, now)
  expect((await query(user, 'SELECT * FROM people_reminder_deliveries')).rowCount).toBe(1)
})
