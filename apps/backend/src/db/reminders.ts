import type { AddReminderBody } from '@aurboda/api-spec'

import type { Queryable } from './pool.ts'

import { query } from './connection.ts'

export interface ReminderRecord extends AddReminderBody {
  id: string
  next_due_at: Date | null
  last_test_at: Date | null
  created_at: Date
  updated_at: Date
}

export const listReminders = async (db: string | Queryable): Promise<ReminderRecord[]> =>
  (await query<ReminderRecord>(db, 'SELECT * FROM custom_reminders ORDER BY created_at, id LIMIT 100')).rows

export const getReminder = async (tx: Queryable, id: string): Promise<ReminderRecord | null> =>
  (await tx.query<ReminderRecord>('SELECT * FROM custom_reminders WHERE id = $1 FOR UPDATE', [id])).rows[0] ??
  null

export const insertReminder = async (
  tx: Queryable,
  body: AddReminderBody,
  next: Date | null,
): Promise<ReminderRecord> => {
  const result = await tx.query<ReminderRecord>(
    `INSERT INTO custom_reminders (title, time_of_day, timezone, recurrence, start_date, enabled, link, next_due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      body.title,
      body.time_of_day,
      body.timezone,
      body.recurrence,
      body.start_date,
      body.enabled,
      body.link,
      next,
    ],
  )
  return result.rows[0]!
}

export const updateReminder = async (
  tx: Queryable,
  id: string,
  body: AddReminderBody,
  next: Date | null,
): Promise<ReminderRecord> => {
  const result = await tx.query<ReminderRecord>(
    `UPDATE custom_reminders SET title=$2, time_of_day=$3, timezone=$4, recurrence=$5, start_date=$6,
     enabled=$7, link=$8, next_due_at=$9, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [
      id,
      body.title,
      body.time_of_day,
      body.timezone,
      body.recurrence,
      body.start_date,
      body.enabled,
      body.link,
      next,
    ],
  )
  return result.rows[0]!
}
