import type { Queryable } from '../db/pool.ts'
import type { PgBoss } from './pg-boss.ts'

import { query, withUserTransaction } from '../db/connection.ts'
import * as notifications from '../db/notifications.ts'
import { withPeopleReminderClaim, listDuePeopleReminders } from '../db/people-reminders.ts'
import { enqueueAdhdReminders, maySendAdhdNotification } from './adhd.ts'
import { browserPushConfiguration, sendStoredNotification } from './browser-push.ts'
import { checkInDeps, raiseDueCheckIns } from './check-ins.ts'
import { createNotifier } from './notifications.ts'
import { dispatchPeopleReminder, setPeopleReminderSchedulerReady } from './people-reminders.ts'
import { deliverDueReminders, setReminderSchedulerReady } from './reminders.ts'
import { deliverTreatmentCheckins, setTreatmentCheckinSchedulerReady } from './treatment-checkins.ts'

const transactionNotifier = (tx: Queryable) =>
  createNotifier({
    getPreference: (_user, type) => notifications.getNotificationPreference(tx, type),
    insert: (_user, input) => notifications.insertNotification(tx, input),
    prune: (_user, read, any) => notifications.pruneNotifications(tx, read, any),
    revise: (_user, target, patch) => notifications.reviseNotification(tx, target, patch),
    reviseOpen: (_user, keys, patch) => notifications.reviseOpenNotifications(tx, keys, patch),
  })
export const enqueuePeopleReminders = async (user: string, now = new Date()) => {
  for (const candidate of await listDuePeopleReminders(user, now)) {
    await withPeopleReminderClaim(user, candidate, now, (claim, tx) =>
      dispatchPeopleReminder(claim, now, async () => {
        if (!tx) throw new Error('People reminder claim requires its transaction')
        await transactionNotifier(tx).raise(user, {
          type: 'people_event',
          title: 'People reminder',
          link: `/people?person=${candidate.person_id}`,
          data: { event_id: candidate.id, revision: candidate.revision },
          dedupe_key: `people-event:${candidate.id}:${candidate.revision}`,
        })
        return 'accepted'
      }),
    )
  }
}
export const enqueueFormReminders = async (user: string) => {
  for (const form of await checkInDeps.listForms(user, {})) {
    await checkInDeps.withFormLock(user, form.id, async (scope) => {
      const active = scope ?? checkInDeps,
        current = await active.getForm(user, form.id)
      if (current && !current.deleted_at) {
        await raiseDueCheckIns({ ...active, listForms: async () => [current] }, user)
      }
    })
  }
}
export const deliverBrowserNotifications = async (
  user: string,
  now = new Date(),
  send = sendStoredNotification,
): Promise<number> => {
  if (send === sendStoredNotification && !browserPushConfiguration()) return 0
  await withUserTransaction(user, async (tx) => {
    await tx.query(
      `INSERT INTO notification_browser_deliveries(notification_id,subscription_id,next_attempt_at)
   SELECT n.id,s.id,$1 FROM notifications n CROSS JOIN browser_push_subscriptions s
   CROSS JOIN notification_delivery_state state
   LEFT JOIN notification_preferences p ON p.type=n.type
   WHERE n.push AND n.read_at IS NULL AND COALESCE(p.push,true)
    AND n.created_at>=state.not_before AND n.created_at>=$1::timestamptz-INTERVAL '24 hours'
   ON CONFLICT DO NOTHING`,
      [now],
    )
  })
  const startedAt = Date.now()
  let sent = 0
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = await withUserTransaction(user, async (tx) => {
      const result = await tx.query<{ notification_id: string; subscription_id: string; type: string }>(
        `SELECT d.notification_id,d.subscription_id,n.type FROM notification_browser_deliveries d JOIN notifications n ON n.id=d.notification_id
    LEFT JOIN notification_preferences p ON p.type=n.type
    WHERE d.status='pending' AND d.next_attempt_at<=$1 AND d.attempts<12 AND n.push AND COALESCE(p.push,true) AND n.read_at IS NULL AND n.created_at>=$1::timestamptz-INTERVAL '24 hours'
    ORDER BY d.next_attempt_at,d.notification_id,d.subscription_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,
        [now],
      )
      const claimed = result.rows[0]
      if (!claimed) return null
      await tx.query(
        "UPDATE notification_browser_deliveries SET attempts=attempts+1,next_attempt_at=$3::timestamptz+INTERVAL '5 minutes' WHERE notification_id=$1 AND subscription_id=$2",
        [claimed.notification_id, claimed.subscription_id, now],
      )
      return claimed
    })
    if (!row) break
    if (
      row.type === 'adhd_prompt' &&
      !(await maySendAdhdNotification(
        user,
        row.notification_id,
        new Date(now.getTime() + Date.now() - startedAt),
      ))
    ) {
      continue
    }
    // The claim is committed before external delivery; retries use the same browser tag.
    const outcome = await send(user, row.subscription_id, row.notification_id)
    if (outcome === 'accepted') sent++
    await query(
      user,
      'UPDATE notification_browser_deliveries SET status=$3 WHERE notification_id=$1 AND subscription_id=$2',
      [
        row.notification_id,
        row.subscription_id,
        outcome === 'accepted' ? 'delivered' : outcome === 'unavailable' ? 'expired' : 'pending',
      ],
    )
  }
  return sent
}
export const runNotificationTick = async (listUsers: () => Promise<string[]>, now = new Date()) => {
  for (const user of await listUsers()) {
    for (const step of [
      () => deliverDueReminders(user, now),
      () => deliverTreatmentCheckins(user, now),
      () => enqueuePeopleReminders(user, now),
      () => enqueueFormReminders(user),
      () => enqueueAdhdReminders(user, now),
      () => deliverBrowserNotifications(user, now),
    ]) {
      try {
        await step()
      } catch {
        console.warn('A notification sweep could not finish; the next tick will retry.')
      }
    }
    await query(
      user,
      `UPDATE notifications n SET actions='[]'::jsonb,read_at=COALESCE(n.read_at,$1) FROM check_in_forms f WHERE n.type='check_in_due' AND n.data->>'form_id'=f.id::text AND (f.archived OR f.deleted_at IS NOT NULL OR n.created_at<$1::timestamptz-INTERVAL '26 hours')`,
      [now],
    ).catch(() => {})
  }
}
export const createNotificationCoordinator = async (boss: PgBoss, listUsers: () => Promise<string[]>) => {
  setPeopleReminderSchedulerReady(false)
  setReminderSchedulerReady(false)
  setTreatmentCheckinSchedulerReady(false)
  for (const name of ['people-reminders', 'custom-reminders', 'treatment-checkins']) {
    await boss.unschedule(name)
  }
  await boss.createQueue('notification-coordinator')
  await boss.schedule('notification-coordinator', '* * * * *')
  await boss.work('notification-coordinator', { batchSize: 1, pollingIntervalSeconds: 10 }, async () =>
    runNotificationTick(listUsers),
  )
  setPeopleReminderSchedulerReady(true)
  setReminderSchedulerReady(true)
  setTreatmentCheckinSchedulerReady(true)
}
