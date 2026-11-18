import {
  addReminderBodySchema,
  updateReminderBodySchema,
  type AddReminderBody,
  type Reminder,
  type UpdateReminderBody,
} from '@aurboda/api-spec'

import type { Queryable } from '../db/pool.ts'
import type { PgBoss } from './pg-boss.ts'

import { withUserTransaction } from '../db/connection.ts'
import {
  getNotificationPreference,
  insertNotification,
  pruneNotifications,
  reviseNotification,
  reviseOpenNotifications,
} from '../db/notifications.ts'
import {
  getReminder,
  insertReminder,
  listReminders,
  type ReminderRecord,
  updateReminder,
} from '../db/reminders.ts'
import { httpError } from '../http-error.ts'
import { createNotifier } from './notifications.ts'

export const nextReminderOccurrence = (body: AddReminderBody, after: Date): Date | null => {
  if (!body.enabled) return null
  const now = Temporal.Instant.fromEpochMilliseconds(after.getTime())
  const localToday = now.toZonedDateTimeISO(body.timezone).toPlainDate()
  const start = Temporal.PlainDate.from(body.start_date)
  let day = Temporal.PlainDate.compare(start, localToday) > 0 ? start : localToday
  for (let offset = 0; offset < 8; offset++, day = day.add({ days: 1 })) {
    if (body.recurrence === 'once' && !day.equals(start)) return null
    if (body.recurrence === 'weekdays' && day.dayOfWeek > 5) continue
    if (body.recurrence === 'weekly' && day.dayOfWeek !== start.dayOfWeek) continue
    const candidate = day
      .toPlainDateTime(Temporal.PlainTime.from(body.time_of_day))
      .toZonedDateTime(body.timezone, { disambiguation: 'compatible' })
      .toInstant()
    if (Temporal.Instant.compare(candidate, now) > 0) return new Date(Number(candidate.epochMilliseconds))
  }
  return null
}

export const serializeReminder = (row: ReminderRecord): Reminder => ({
  id: row.id,
  title: row.title,
  time_of_day: row.time_of_day,
  timezone: row.timezone,
  recurrence: row.recurrence,
  start_date: row.start_date,
  enabled: row.enabled,
  link: row.link,
  next_due_at: row.next_due_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
})

const validate = (value: unknown, now: Date): { body: AddReminderBody; next: Date | null } => {
  const parsed = addReminderBodySchema.safeParse(value)
  if (!parsed.success) throw httpError(400, 'Check the reminder name, date, time, timezone and page path.')
  const body = parsed.data
  let next: Date | null
  try {
    next = nextReminderOccurrence(body, now)
  } catch {
    throw httpError(400, 'Choose a valid date and timezone.')
  }
  if (body.enabled && !next) throw httpError(400, 'Choose a future date and time for a one-time reminder.')
  return { body, next }
}

const transactionalNotifier = (tx: Queryable) =>
  createNotifier({
    getPreference: (_user, type) => getNotificationPreference(tx, type),
    insert: (_user, input) => insertNotification(tx, input),
    prune: (_user, read, any) => pruneNotifications(tx, read, any),
    revise: (_user, target, patch) => reviseNotification(tx, target, patch),
    reviseOpen: (_user, keys, patch) => reviseOpenNotifications(tx, keys, patch),
  })

export const queryReminders = async (user: string): Promise<Reminder[]> =>
  (await listReminders(user)).map(serializeReminder)

export const addReminder = async (
  user: string,
  value: AddReminderBody,
  now = new Date(),
): Promise<Reminder> => {
  const { body, next } = validate(value, now)
  return withUserTransaction(user, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(184753)')
    const count = await tx.query<{ count: string }>('SELECT COUNT(*) FROM custom_reminders')
    if (Number(count.rows[0]!.count) >= 100) throw httpError(409, 'You can keep up to 100 custom reminders.')
    return serializeReminder(await insertReminder(tx, body, next))
  })
}

export const changeReminder = async (
  user: string,
  id: string,
  patch: UpdateReminderBody,
  now = new Date(),
): Promise<Reminder> =>
  withUserTransaction(user, async (tx) => {
    if (!updateReminderBodySchema.safeParse(patch).success) {
      throw httpError(400, 'Provide a valid reminder change.')
    }
    const row = await getReminder(tx, id)
    if (!row) throw httpError(404, 'Reminder not found.')
    const { body, next } = validate(
      {
        title: row.title,
        time_of_day: row.time_of_day,
        timezone: row.timezone,
        recurrence: row.recurrence,
        start_date: row.start_date,
        enabled: row.enabled,
        link: row.link,
        ...patch,
      },
      now,
    )
    return serializeReminder(await updateReminder(tx, id, body, next))
  })

export const removeReminder = async (user: string, id: string): Promise<void> => {
  await withUserTransaction(user, async (tx) => {
    const row = await getReminder(tx, id)
    if (!row) throw httpError(404, 'Reminder not found.')
    await tx.query('DELETE FROM custom_reminders WHERE id = $1', [id])
  })
}

let schedulerReady = false
export const reminderSchedulerReady = (): boolean => schedulerReady

export const testReminderNotification = async (
  user: string,
  id: string,
  now = new Date(),
): Promise<boolean> =>
  withUserTransaction(user, async (tx) => {
    await tx.query('INSERT INTO custom_reminder_state (singleton) VALUES (true) ON CONFLICT DO NOTHING')
    const state = await tx.query<{ last_test_at: Date | null }>(
      'SELECT last_test_at FROM custom_reminder_state WHERE singleton = true FOR UPDATE',
    )
    const row = await getReminder(tx, id)
    if (!row) throw httpError(404, 'Reminder not found.')
    const last = state.rows[0]?.last_test_at
    if (last && now.getTime() - last.getTime() < 60_000) {
      throw httpError(409, 'Wait one minute before sending another test.')
    }
    const notification = await transactionalNotifier(tx).raise(user, {
      type: 'reminder',
      title: row.title,
      body: 'Test reminder',
      link: row.link ?? '/settings#custom-reminders',
      dedupe_key: `reminder-test:${id}:${now.toISOString()}`,
    })
    await tx.query('UPDATE custom_reminder_state SET last_test_at=$1 WHERE singleton = true', [now])
    return notification !== null
  })

export const deliverDueReminders = async (user: string, now = new Date()): Promise<number> => {
  // The lock covers notification creation and schedule advancement together. Concurrent edits wait;
  // a crash rolls both back, so the next tick retries without a lost or duplicated occurrence.
  return withUserTransaction(user, async (tx) => {
    const due = await tx.query<ReminderRecord>(
      'SELECT * FROM custom_reminders WHERE enabled AND next_due_at <= $1 ORDER BY next_due_at LIMIT 100 FOR UPDATE SKIP LOCKED',
      [now],
    )
    let delivered = 0
    const notify = transactionalNotifier(tx)
    for (const row of due.rows) {
      if (now.getTime() - row.next_due_at!.getTime() <= 3_600_000) {
        const result = await notify.raise(user, {
          type: 'reminder',
          title: row.title,
          link: row.link ?? '/settings#custom-reminders',
          dedupe_key: `reminder:${row.id}:${row.next_due_at!.toISOString()}`,
        })
        if (result) delivered++
      }
      const next = nextReminderOccurrence(row, now)
      await tx.query('UPDATE custom_reminders SET next_due_at=$2, enabled=$3 WHERE id=$1', [
        row.id,
        next,
        next !== null,
      ])
    }
    return delivered
  })
}

export const runReminderTick = async (
  listUsers: () => Promise<string[]>,
  deliver = deliverDueReminders,
): Promise<void> => {
  for (const user of await listUsers()) {
    try {
      await deliver(user)
    } catch {
      console.warn('Custom reminder delivery failed; next tick will retry.')
    }
  }
}

export const createReminderScheduler = async (
  boss: PgBoss,
  listUsers: () => Promise<string[]>,
): Promise<void> => {
  const queue = 'custom-reminders'
  await boss.createQueue(queue)
  await boss.schedule(queue, '* * * * *')
  await boss.work(queue, { batchSize: 1, pollingIntervalSeconds: 10 }, async () => {
    await runReminderTick(listUsers)
  })
  schedulerReady = true
}

export const reminderActions = {
  add: addReminder,
  change: changeReminder,
  list: queryReminders,
  remove: removeReminder,
  test: testReminderNotification,
  ready: reminderSchedulerReady,
}
