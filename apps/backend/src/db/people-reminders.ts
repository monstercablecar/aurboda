import type { PeopleEventBody } from '@aurboda/api-spec'

import { query, withUserTransaction } from './connection.ts'

export interface ReminderCandidate {
  id: string
  person_id: string
  revision: number
}
export interface ReminderClaim extends ReminderCandidate {
  event: PeopleEventBody
  attempts: number
}
export type ReminderOutcome = 'accepted' | 'unavailable' | 'retry' | 'expired'

export const listDuePeopleReminders = async (user: string, now: Date): Promise<ReminderCandidate[]> =>
  (
    await query<ReminderCandidate>(
      user,
      `SELECT e.id,e.person_id,e.revision FROM people_events e
    WHERE e.event->>'reminder_at' IS NOT NULL AND (e.event->>'reminder_at')::timestamptz <= $1
    AND NOT EXISTS (SELECT 1 FROM people_reminder_deliveries d WHERE d.event_id=e.id AND
      ((d.status='accepted' AND d.reminder_at=(e.event->>'reminder_at')::timestamptz)
       OR (d.revision=e.revision AND (d.status IN ('accepted','expired') OR d.retry_after>$1))))
    ORDER BY (e.event->>'reminder_at')::timestamptz,e.id LIMIT 100`,
      [now],
    )
  ).rows

// Parent/event locks use the same order as event edits and deletion. Sending is bounded by the push timeout.
// Keeping the lock through dispatch prevents a removed or corrected reminder from being sent afterward.
export const withPeopleReminderClaim = async (
  user: string,
  candidate: ReminderCandidate,
  now: Date,
  dispatch: (claim: ReminderClaim) => Promise<ReminderOutcome>,
): Promise<boolean> =>
  withUserTransaction(user, async (tx) => {
    const parent = await query(tx, 'SELECT id FROM people WHERE id=$1 FOR UPDATE SKIP LOCKED', [
      candidate.person_id,
    ])
    if (!parent.rows.length) return false
    const current = await query<ReminderCandidate & { event: PeopleEventBody }>(
      tx,
      'SELECT id,person_id,revision,event FROM people_events WHERE id=$1 AND person_id=$2 FOR UPDATE SKIP LOCKED',
      [candidate.id, candidate.person_id],
    )
    const event = current.rows[0]
    if (!event || event.revision !== candidate.revision || !event.event.reminder_at) return false
    const reminderAt = event.event.reminder_at
    const old = await query<{
      revision: number
      status: ReminderOutcome
      attempts: number
      retry_after: Date | null
      reminder_at: Date
    }>(
      tx,
      'SELECT revision,status,attempts,retry_after,reminder_at FROM people_reminder_deliveries WHERE event_id=$1',
      [candidate.id],
    )
    const previous = old.rows.find((d) => d.revision === candidate.revision)
    if (
      old.rows.some((d) => d.status === 'accepted' && d.reminder_at.getTime() === Date.parse(reminderAt)) ||
      previous?.status === 'expired' ||
      (previous?.retry_after && previous.retry_after > now)
    ) {
      return false
    }
    const attempts = previous?.attempts ?? 0
    const outcome = await dispatch({ ...event, attempts })
    await query(
      tx,
      `INSERT INTO people_reminder_deliveries(event_id,revision,reminder_at,status,attempts,retry_after)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id,revision) DO UPDATE SET status=$4,attempts=$5,retry_after=$6,updated_at=NOW()`,
      [
        candidate.id,
        candidate.revision,
        event.event.reminder_at,
        outcome,
        attempts + 1,
        outcome === 'retry' || outcome === 'unavailable' ? new Date(now.getTime() + 5 * 60_000) : null,
      ],
    )
    return true
  })
