import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import {
  addReminder,
  changeReminder,
  deliverDueReminders,
  queryReminders,
  removeReminder,
  testReminderNotification,
} from '../services/reminders.ts'
import { cleanTestDb, getTestUser, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { query } from './connection.ts'
import { listNotifications, upsertNotificationPreference } from './notifications.ts'

const body = {
  title: 'Check in',
  time_of_day: '20:00',
  timezone: 'America/Denver',
  recurrence: 'daily' as const,
  start_date: '2026-11-17',
  enabled: true,
  link: '/journal',
}
const before = new Date('2026-11-17T22:00:00Z')
const due = new Date('2026-11-18T03:00:30Z')

describe('custom reminders persistence and delivery', () => {
  beforeAll(startTestDb, 120_000)
  afterAll(stopTestDb)
  beforeEach(async () => {
    await cleanTestDb()
    await query(getTestUser(), 'TRUNCATE custom_reminders, custom_reminder_state')
  })
  test('CRUD preserves omitted fields and is scoped by user database', async () => {
    const user = getTestUser()
    const reminder = await addReminder(user, body, before)
    expect((await queryReminders(user))[0]).toMatchObject(reminder)
    const changed = await changeReminder(user, reminder.id, { title: 'New name' }, before)
    expect(changed).toMatchObject({ ...body, title: 'New name' })
    await expect(
      changeReminder(user, '00000000-0000-4000-8000-000000000000', { enabled: false }, before),
    ).rejects.toMatchObject({ status: 404 })
    await removeReminder(user, reminder.id)
    expect(await queryReminders(user)).toEqual([])
  })
  test('concurrent ticks deliver once, advance, and respect pauses', async () => {
    const user = getTestUser()
    const reminder = await addReminder(user, body, before)
    const results = await Promise.all([deliverDueReminders(user, due), deliverDueReminders(user, due)])
    expect(results.reduce((a, b) => a + b, 0)).toBe(1)
    expect(
      (await listNotifications(user, { limit: 100 })).filter((row) => row.type === 'reminder'),
    ).toHaveLength(1)
    expect((await queryReminders(user))[0]!.next_due_at).toBe('2026-11-19T03:00:00.000Z')
    await changeReminder(user, reminder.id, { enabled: false }, due)
    expect(await deliverDueReminders(user, new Date('2026-11-19T03:00:30Z'))).toBe(0)
  })
  test('skips stale occurrences and expires one-time reminders', async () => {
    const user = getTestUser()
    await addReminder(user, { ...body, recurrence: 'once' }, before)
    expect(await deliverDueReminders(user, new Date('2026-11-18T05:00:00Z'))).toBe(0)
    expect((await queryReminders(user))[0]).toMatchObject({ enabled: false, next_due_at: null })
  })
  test('preferences suppress delivery without retry floods and account-wide tests are limited', async () => {
    const user = getTestUser()
    const first = await addReminder(user, body, before)
    const second = await addReminder(user, body, before)
    await upsertNotificationPreference(user, 'reminder', { in_app: false, push: false })
    expect(await deliverDueReminders(user, due)).toBe(0)
    expect(await testReminderNotification(user, first.id, due)).toBe(false)
    await removeReminder(user, first.id)
    await expect(testReminderNotification(user, second.id, due)).rejects.toMatchObject({ status: 409 })
  })
  test('notification failures roll back schedule changes for retry', async () => {
    const user = getTestUser()
    await addReminder(user, body, before)
    await query(
      user,
      `ALTER TABLE notifications ADD CONSTRAINT fail_reminder_test CHECK (type <> 'reminder')`,
    )
    try {
      await expect(deliverDueReminders(user, due)).rejects.toThrow()
      expect((await queryReminders(user))[0]!.next_due_at).toBe('2026-11-18T03:00:00.000Z')
    } finally {
      await query(user, 'ALTER TABLE notifications DROP CONSTRAINT fail_reminder_test')
    }
    expect(await deliverDueReminders(user, due)).toBe(1)
  })
})
