import type { PeopleEventBody } from '@aurboda/api-spec'

import type { PgBoss } from './pg-boss.ts'

import {
  listDuePeopleReminders,
  withPeopleReminderClaim,
  type ReminderClaim,
  type ReminderOutcome,
} from '../db/people-reminders.ts'
import { httpError } from '../http-error.ts'
import { browserPushConfiguration, createPeopleReminderSender } from './browser-push.ts'

let schedulerReady = false
export const peopleRemindersAvailable = () => schedulerReady && browserPushConfiguration() !== null
export const validatePeopleReminder = (
  event: PeopleEventBody,
  previous?: PeopleEventBody,
  now = new Date(),
  available = peopleRemindersAvailable(),
) => {
  if (!event.reminder_at) {
    if (event.reminder_timezone) throw httpError(400, 'A reminder time is required with its time zone.')
    return
  }
  if (!event.reminder_timezone) throw httpError(400, 'Choose a time zone for the reminder.')
  try {
    new Intl.DateTimeFormat('en', { timeZone: event.reminder_timezone }).format(now)
  } catch {
    throw httpError(400, 'Choose a valid IANA time zone for the reminder.')
  }
  if (event.reminder_at === previous?.reminder_at && event.reminder_timezone === previous.reminder_timezone) {
    return
  }
  if (!available) {
    throw httpError(503, 'Reminders need the server scheduler and browser notifications to be configured.')
  }
  if (!Number.isFinite(Date.parse(event.reminder_at)) || Date.parse(event.reminder_at) <= now.getTime()) {
    throw httpError(400, 'Choose a future reminder time.')
  }
}

export const dispatchPeopleReminder = async (
  claim: ReminderClaim,
  now: Date,
  send: (id: string) => Promise<ReminderOutcome>,
): Promise<ReminderOutcome> => {
  const due = claim.event.reminder_at ? Date.parse(claim.event.reminder_at) : NaN
  if (!Number.isFinite(due) || due > now.getTime()) return 'unavailable'
  if (now.getTime() - due >= 86_400_000 || claim.attempts >= 12) return 'expired'
  return send(claim.id)
}

export const runPeopleReminders = async (deps: {
  listUsers: () => Promise<string[]>
  listDue: typeof listDuePeopleReminders
  withClaim: typeof withPeopleReminderClaim
  send: (user: string, id: string) => Promise<ReminderOutcome>
  now: () => Date
}) => {
  for (const user of await deps.listUsers()) {
    try {
      const now = deps.now()
      for (const candidate of await deps.listDue(user, now)) {
        await deps.withClaim(user, candidate, now, (claim) =>
          dispatchPeopleReminder(claim, now, (id) => deps.send(user, id)),
        )
      }
    } catch {
      // No private user, payload, provider error or endpoint is written to logs.
      console.warn('A People reminder sweep could not finish; it will retry.')
    }
  }
}

export const createPeopleReminderScheduler = async (boss: PgBoss, listUsers: () => Promise<string[]>) => {
  schedulerReady = false
  await boss.createQueue('people-reminders')
  await boss.schedule('people-reminders', '* * * * *')
  const send = createPeopleReminderSender()
  await boss.work('people-reminders', { batchSize: 1, pollingIntervalSeconds: 30 }, async () => {
    await runPeopleReminders({
      listUsers,
      listDue: listDuePeopleReminders,
      withClaim: withPeopleReminderClaim,
      send,
      now: () => new Date(),
    })
  })
  schedulerReady = true
}
