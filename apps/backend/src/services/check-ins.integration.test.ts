import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { _setDbForUser, query } from '../db/connection.ts'
import { createRolePool } from '../db/pool.ts'
import {
  createTestDatabase,
  cleanTestDb,
  getTestUser,
  startTestDb,
  stopTestDb,
} from '../test/db-test-helper.ts'
import { checkInDueActionHandlers } from './check-in-actions.ts'
import { withCheckInTransaction } from './check-in-transaction.ts'
import {
  addCheckInForm,
  checkInDeps,
  deleteCheckInById,
  restoreCheckInById,
  submitCheckIn,
  updateCheckInById,
  listDue,
  type CheckInDeps,
} from './check-ins.ts'
import { notifier } from './notifications.ts'

const user = getTestUser(),
  at = '2026-11-23T10:00:00.000Z'
beforeAll(startTestDb, 120000)
afterAll(stopTestDb, 60000)
beforeEach(cleanTestDb)
const unwrap = <T>(outcome: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!outcome.ok) throw new Error(outcome.error)
  return outcome.value
}
const depsFor = (overrides: Partial<CheckInDeps> = {}) => {
  const deps = { ...checkInDeps, ...overrides }
  deps.withFormLock = (account, id, fn) => withCheckInTransaction(deps, account, id, fn)
  return deps
}
const form = async (outputs_enabled = false) =>
  unwrap(
    await addCheckInForm(checkInDeps, user, {
      name: 'Synthetic routine',
      notify: true,
      outputs_enabled,
      questions: [
        {
          key: 'score',
          prompt: 'Score',
          type: 'number',
          required: true,
          default: 3,
          logs_to: { metric: 'synthetic_score' },
        },
        {
          key: 'walk',
          prompt: 'Walked?',
          type: 'yes_no',
          required: false,
          default: true,
          logs_to: { activity_type: 'walking' },
        },
      ],
      schedule: { times: ['10:00'], weekdays: [1, 2, 3, 4, 5, 6, 7], day_starts_at: '00:00' },
    }),
  )
const counts = async () =>
  Object.fromEntries(
    await Promise.all(
      [
        'check_ins',
        'time_series',
        'check_in_metric_outputs',
        'check_in_activity_outputs',
        'activities',
        'check_in_requests',
      ].map(async (table) => [
        table,
        Number((await query<{ count: string }>(user, `SELECT COUNT(*) FROM ${table}`)).rows[0]!.count),
      ]),
    ),
  )

test('private responses never produce general outputs, including subsequent edits and restore', async () => {
  const f = await form(),
    saved = unwrap(
      await submitCheckIn(checkInDeps, user, {
        form_id: f.id,
        answered_at: at,
        answers: { score: 3, walk: true },
      }),
    )
  expect(saved.logged).toEqual({})
  expect(saved.activities).toEqual({})
  unwrap(await updateCheckInById(checkInDeps, user, saved.id, { answers: { score: 4, walk: true } }))
  await deleteCheckInById(checkInDeps, user, saved.id)
  unwrap(await restoreCheckInById(checkInDeps, user, saved.id))
  expect((await counts()).time_series).toBe(0)
  expect((await counts()).activities).toBe(0)
})
test('explicit outputs are owned and retry keys never create a second response', async () => {
  const f = await form(true),
    body = { form_id: f.id, answered_at: at, answers: { score: 3, walk: true }, request_id: randomUUID() }
  const saved = unwrap(await submitCheckIn(checkInDeps, user, body)),
    retried = unwrap(await submitCheckIn(checkInDeps, user, body))
  expect(retried.id).toBe(saved.id)
  expect((await counts()).time_series).toBe(1)
  expect((await counts()).activities).toBe(1)
  await expect(
    submitCheckIn(checkInDeps, user, { ...body, answers: { score: 4, walk: true } }),
  ).rejects.toMatchObject({ status: 409 })
  expect((await query(user, 'SELECT * FROM outbound_sync_queue')).rowCount).toBe(0)
})
test('two forms cannot overwrite the same metric/time; a refused response leaves no partial activity', async () => {
  const a = await form(true),
    b = await form(true)
  const results = await Promise.allSettled(
    [a, b].map((f) =>
      submitCheckIn(checkInDeps, user, { form_id: f.id, answered_at: at, answers: { score: 3, walk: true } }),
    ),
  )
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const rejected = results.find((r) => r.status === 'rejected')
  expect(rejected).toMatchObject({ reason: { status: 409 } })
  expect(await counts()).toMatchObject({
    check_ins: 1,
    time_series: 1,
    activities: 1,
    check_in_metric_outputs: 1,
    check_in_activity_outputs: 1,
  })
})
test('an independent edit of an output survives Undo and cannot be overwritten by restore', async () => {
  const f = await form(true),
    saved = unwrap(
      await submitCheckIn(checkInDeps, user, { form_id: f.id, answered_at: at, answers: { score: 3 } }),
    )
  await query(user, "UPDATE time_series SET value=99,updated_at=clock_timestamp() WHERE source='manual'")
  await deleteCheckInById(checkInDeps, user, saved.id)
  expect((await query<{ value: number }>(user, 'SELECT value FROM time_series')).rows[0]!.value).toBe(99)
  await expect(restoreCheckInById(checkInDeps, user, saved.id)).rejects.toMatchObject({ status: 409 })
  expect((await query(user, 'SELECT id FROM check_ins WHERE deleted_at IS NOT NULL')).rowCount).toBe(1)
})
test('failure after output writes rolls back the outputs, custom metric, request and response', async () => {
  const f = await form(true)
  const deps = depsFor()
  deps.withFormLock = (account, id, fn) =>
    withCheckInTransaction(deps, account, id, (scope) =>
      fn({
        ...scope!,
        insertCheckIn: async () => {
          throw new Error('Synthetic failure before response')
        },
      }),
    )
  await expect(
    submitCheckIn(deps, user, {
      form_id: f.id,
      answered_at: at,
      answers: { score: 3, walk: true },
      request_id: randomUUID(),
    }),
  ).rejects.toThrow('Synthetic failure')
  expect(await counts()).toMatchObject({
    check_ins: 0,
    time_series: 0,
    activities: 0,
    check_in_metric_outputs: 0,
    check_in_activity_outputs: 0,
    check_in_requests: 0,
  })
  expect((await query(user, "SELECT name FROM custom_metrics WHERE name='synthetic_score'")).rowCount).toBe(0)
})
test('failure after edit deletes rolls back to the original point and response', async () => {
  const f = await form(true),
    saved = unwrap(
      await submitCheckIn(checkInDeps, user, { form_id: f.id, answered_at: at, answers: { score: 3 } }),
    )
  const deps = depsFor()
  deps.withFormLock = (account, id, fn) =>
    withCheckInTransaction(deps, account, id, (scope) =>
      fn({
        ...scope!,
        updateCheckIn: async () => {
          throw new Error('Synthetic edit failure')
        },
      }),
    )
  await expect(updateCheckInById(deps, user, saved.id, { answers: { score: 8 } })).rejects.toThrow(
    'Synthetic edit failure',
  )
  expect((await query<{ value: number }>(user, 'SELECT value FROM time_series')).rows[0]!.value).toBe(3)
  expect(
    (await query<{ answers: unknown }>(user, 'SELECT answers FROM check_ins WHERE id=$1', [saved.id]))
      .rows[0]!.answers,
  ).toEqual({ score: 3 })
})
test('concurrent notification Done and Skip close a slot once; Undo opens it without fabricating a missed fact', async () => {
  const f = await form(true),
    deps = depsFor({ now: () => new Date(at) })
  const notification = await notifier.raise(user, {
    type: 'check_in_due',
    title: f.name,
    data: { form_id: f.id, scheduled_for: at },
    actions: [
      { key: 'done', label: 'Done' },
      { key: 'skip', label: 'Skip' },
    ],
    dedupe_key: 'synthetic-slot',
  })
  const handlers = checkInDueActionHandlers(deps)
  const results = await Promise.all([
    handlers.done!(user, notification!),
    handlers.skip!(user, notification!),
  ])
  expect(results.filter((r) => r.ok)).toHaveLength(1)
  expect((await counts()).check_ins).toBe(1)
  const record = (await query<{ id: string }>(user, 'SELECT id FROM check_ins')).rows[0]!
  await deleteCheckInById(deps, user, record.id)
  const future = depsFor({ now: () => new Date('2026-11-24T12:00:00Z') })
  expect((await listDue(future, user, '2026-11-23')).slots[0]!.state).toBe('unrecorded')
  expect((await query(user, 'SELECT id FROM check_ins WHERE deleted_at IS NULL')).rowCount).toBe(0)
  const stored = (
    await query<{ actions: unknown }>(user, 'SELECT actions FROM notifications WHERE id=$1', [
      notification!.id,
    ])
  ).rows[0]!
  expect(stored.actions).toEqual([])
})
test('check-ins stay in the authenticated account database', async () => {
  const f = await form(true)
  const other = await createTestDatabase(),
    pool = createRolePool({ connectionString: other.uri, max: 3 })
  _setDbForUser('other-checkin-account', pool)
  try {
    expect(
      await submitCheckIn(checkInDeps, 'other-checkin-account', { form_id: f.id, answers: { score: 3 } }),
    ).toMatchObject({ ok: false, status: 404 })
  } finally {
    await pool.end()
    await other.drop()
  }
  expect((await counts()).check_ins).toBe(0)
})
