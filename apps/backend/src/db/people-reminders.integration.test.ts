import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { getTestDbClient, getTestUser, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { listDuePeopleReminders, withPeopleReminderClaim } from './people-reminders.ts'

beforeAll(startTestDb, 120000)
afterAll(stopTestDb)
beforeEach(async () => {
  await getTestDbClient().query('TRUNCATE people CASCADE')
})
const now = new Date('2026-11-11T12:00:00Z')
const seed = async () => {
  const client = getTestDbClient(),
    person_id = randomUUID(),
    id = randomUUID()
  await client.query('INSERT INTO people(id,profile) VALUES($1,$2)', [person_id, {}])
  await client.query('INSERT INTO people_events(id,person_id,actor,event) VALUES($1,$2,$3,$4)', [
    id,
    person_id,
    getTestUser(),
    {
      type: 'appointment',
      timestamp: now.toISOString(),
      reminder_at: now.toISOString(),
      reminder_timezone: 'America/Denver',
    },
  ])
  return { id, person_id, revision: 1 }
}
test('concurrent sweeps send once, unchanged reminders stay delivered after edits, and person deletion cascades', async () => {
  const candidate = await seed(),
    user = getTestUser()
  let calls = 0
  const dispatch = async () => {
    calls++
    return 'accepted' as const
  }
  await Promise.all([
    withPeopleReminderClaim(user, candidate, now, dispatch),
    withPeopleReminderClaim(user, candidate, now, dispatch),
  ])
  expect(calls).toBe(1)
  expect(await listDuePeopleReminders(user, now)).toEqual([])
  await getTestDbClient().query('UPDATE people_events SET revision=2 WHERE id=$1', [candidate.id])
  expect(await listDuePeopleReminders(user, now)).toEqual([])
  await getTestDbClient().query('DELETE FROM people WHERE id=$1', [candidate.person_id])
  expect((await getTestDbClient().query('SELECT * FROM people_reminder_deliveries')).rows).toEqual([])
})
test('stale revisions and removed opt-ins never dispatch', async () => {
  const candidate = await seed()
  let calls = 0
  const dispatch = async () => {
    calls++
    return 'accepted' as const
  }
  await getTestDbClient().query('UPDATE people_events SET revision=2 WHERE id=$1', [candidate.id])
  expect(await withPeopleReminderClaim(getTestUser(), candidate, now, dispatch)).toBe(false)
  await getTestDbClient().query("UPDATE people_events SET event=event-'reminder_at' WHERE id=$1", [
    candidate.id,
  ])
  expect(await withPeopleReminderClaim(getTestUser(), { ...candidate, revision: 2 }, now, dispatch)).toBe(
    false,
  )
  expect(calls).toBe(0)
})
test('unavailable delivery persists a retry time; future reminders are not selected', async () => {
  const candidate = await seed(),
    user = getTestUser()
  await withPeopleReminderClaim(user, candidate, now, async () => 'unavailable')
  expect(await listDuePeopleReminders(user, now)).toEqual([])
  expect(await listDuePeopleReminders(user, new Date(now.getTime() + 300001))).toHaveLength(1)
  await getTestDbClient().query(
    "UPDATE people_events SET event=jsonb_set(event,'{reminder_at}',$2::jsonb),revision=2 WHERE id=$1",
    [candidate.id, JSON.stringify('2026-11-12T12:00:00Z')],
  )
  expect(await listDuePeopleReminders(user, now)).toEqual([])
})
