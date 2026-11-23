import {
  createJournalEntryBodySchema,
  createPersonBodySchema,
  journalEntriesQuerySchema,
} from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { _setDbForUser } from '../db/connection.ts'
import { createRolePool } from '../db/pool.ts'
import { privateLinkTables } from '../schema/private-links.ts'
import {
  startTestDb,
  stopTestDb,
  getTestDbClient,
  getTestUser,
  createTestDatabase,
} from '../test/db-test-helper.ts'
import { JOURNAL_CATALOG } from './journal-catalog.ts'
import * as journal from './journal.ts'
import * as people from './people.ts'
import * as links from './private-links.ts'

const user = getTestUser()
beforeAll(startTestDb, 120000)
afterAll(stopTestDb, 60000)
beforeEach(async () => {
  await getTestDbClient().query('TRUNCATE people,journal_entries,activities CASCADE')
})
const person = () =>
  people.createPerson(
    user,
    createPersonBodySchema.parse({
      name: 'Synthetic private person',
      relationship: 'friend',
      needs: ['relationship_maintenance'],
      approximate_age: { value: 30, unit: 'years', as_of: '2026-11-23' },
      notes: 'Private care narrative',
    }),
  )
const activity = async (start = '2026-11-20T10:00:00Z', end = '2026-11-20T11:00:00Z') => {
  const id = randomUUID()
  await getTestDbClient().query(
    "INSERT INTO activities(id,source,external_id,activity_type,start_time,end_time,title) VALUES($1::uuid,'aurboda',$1::text,'walking',$2,$3,'Synthetic walk')",
    [id, start, end],
  )
  return id
}
const entry = () =>
  createJournalEntryBodySchema.parse({
    id: randomUUID(),
    title: 'Synthetic reflection',
    content: 'Private original words',
    occurred_at: '2026-11-20T12:00:00Z',
  })
test('links use canonical IDs and fresh names; deleting a person leaves activities and rich Journal data', async () => {
  const p = await person(),
    a = await activity()
  await links.setActivityPeople(user, a, { person_ids: [p.id, p.id.toUpperCase()] })
  expect(await links.getActivityPeople(user, a)).toEqual([{ id: p.id, kind: 'person', name: p.name }])
  await people.updatePerson(user, p.id, { preferred_name: 'New preferred name' })
  expect((await links.getActivityPeople(user, a))[0].name).toBe('New preferred name')
  const e = await journal.createJournalEntry(user, {
    ...entry(),
    links: [
      { kind: 'person', record_id: p.id, label: '' },
      { kind: 'activity', record_id: a, label: '' },
    ],
  })
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
  const attachment = await journal.addJournalAttachment(user, e.id, {
    filename: 'synthetic.png',
    mime_type: 'image/png',
    bytes,
  })
  await people.deletePerson(user, p.id)
  expect(await links.getActivityPeople(user, a)).toEqual([])
  const preserved = await journal.getJournalEntry(user, e.id)
  expect(preserved).toEqual(e)
  expect((await journal.getJournalAttachment(user, attachment.id)).bytes).toEqual(bytes)
  expect(
    (
      await journal.updateJournalEntry(user, e.id, {
        expected_updated_at: e.updated_at,
        links: e.links,
        title: 'Keep historical references',
      })
    ).links,
  ).toEqual(e.links)
  expect((await getTestDbClient().query('SELECT id FROM activities WHERE id=$1', [a])).rowCount).toBe(1)
})
test('merged source associations update every member and leave unrelated activities alone', async () => {
  const p = await person(),
    a = await activity(),
    b = await activity(),
    unrelated = await activity()
  await links.setActivityPeople(user, a, { person_ids: [p.id], activity_ids: [b] })
  expect((await links.getActivityPeople(user, a)).map((linked) => linked.id)).toEqual([p.id])
  expect((await links.getActivityPeople(user, b)).map((linked) => linked.id)).toEqual([p.id])
  expect(await links.getActivityPeople(user, unrelated)).toEqual([])
  await expect(
    links.setActivityPeople(user, a, { person_ids: [], activity_ids: [randomUUID()] }),
  ).rejects.toMatchObject({ status: 400 })
  expect((await links.getActivityPeople(user, a)).map((linked) => linked.id)).toEqual([p.id])
  await links.setActivityPeople(user, a, { person_ids: [], activity_ids: [b] })
  expect(await links.getActivityPeople(user, b)).toEqual([])
})
test('invalid or cross-account targets roll back; link changes retain idempotency and revisions', async () => {
  const p = await person(),
    a = await activity(),
    input = { ...entry(), links: [{ kind: 'person' as const, record_id: p.id, label: '' }] }
  const created = await journal.createJournalEntry(user, input)
  expect(await journal.createJournalEntry(user, input)).toEqual(created)
  const foreign = await createTestDatabase(),
    pool = createRolePool({ connectionString: foreign.uri, max: 3 })
  _setDbForUser('otherlinkuser', pool)
  try {
    await expect(links.setActivityPeople('otherlinkuser', a, { person_ids: [p.id] })).rejects.toMatchObject({
      status: 404,
    })
    await expect(journal.createJournalEntry('otherlinkuser', input)).rejects.toMatchObject({ status: 400 })
    await expect(journal.getJournalEntry('otherlinkuser', created.id)).rejects.toMatchObject({ status: 404 })
    await expect(
      journal.updateJournalEntry(user, created.id, {
        expected_updated_at: created.updated_at,
        links: [{ kind: 'activity', record_id: randomUUID(), label: '' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(await journal.listJournalRevisions(user, created.id)).toEqual([])
    const changed = await journal.updateJournalEntry(user, created.id, {
      expected_updated_at: created.updated_at,
      links: [...created.links, { kind: 'activity', record_id: a, label: '' }],
    })
    expect((await journal.listJournalRevisions(user, created.id))[0].snapshot).toEqual(created)
    await expect(
      journal.updateJournalEntry(user, created.id, { expected_updated_at: created.updated_at, links: [] }),
    ).rejects.toMatchObject({ status: 409 })
    const filtered = await journal.listJournalEntries(
      user,
      journalEntriesQuerySchema.parse({ related_kind: 'activity', related_id: a }),
    )
    expect(filtered.data).toEqual([changed])
  } finally {
    await pool.end()
    await foreign.drop()
  }
})
test('time-with counts overlaps once, clips dates and treats missing metrics as unknown', async () => {
  const p = await person(),
    a = await activity(),
    b = await activity('2026-11-20T10:30:00Z', '2026-11-20T11:30:00Z')
  await Promise.all([
    links.setActivityPeople(user, a, { person_ids: [p.id] }),
    links.setActivityPeople(user, b, { person_ids: [p.id] }),
  ])
  const result = await links.personTimeWith(user, p.id, {
    from: '2026-11-20',
    to: '2026-11-21',
    timezone: 'UTC',
    metric: 'synthetic_unobserved',
  })
  expect(result.total_minutes).toBe(90)
  expect(result.days.map((d) => [d.minutes, d.metric_value])).toEqual([
    [90, null],
    [0, null],
  ])
  expect(result.correlation).toBeNull()
  await expect(
    links.personTimeWith(user, p.id, { from: '2026-01-01', to: '2027-02-01', timezone: 'UTC' }),
  ).rejects.toMatchObject({ status: 400 })
})
test('private time comparison uses explicit shared durations, configured daily aggregation and established correlation', async () => {
  const p = await person()
  for (const [day, minutes] of [
    [20, 10],
    [21, 20],
  ] as const) {
    const a = await activity(`2026-11-${day}T10:00:00Z`, `2026-11-${day}T10:${minutes}:00Z`)
    await links.setActivityPeople(user, a, { person_ids: [p.id] })
  }
  await people.createEvent(user, p.id, {
    type: 'shared_activity',
    source: 'manual',
    timestamp: '2026-11-22T10:00:00Z',
    end_time: '2026-11-22T10:30:00Z',
    payload: { title: 'Synthetic shared time' },
  })
  await people.createEvent(user, p.id, {
    type: 'care',
    source: 'manual',
    timestamp: '2026-11-20T08:00:00Z',
    payload: { note: 'Observation without duration' },
  })
  await getTestDbClient().query(
    "INSERT INTO custom_metrics(name,unit,aggregation) VALUES('synthetic_analysis','score','sum')",
  )
  for (const [day, value] of [
    [20, 1],
    [21, 2],
    [22, 3],
  ] as const) {
    for (const hour of [10, 11]) {
      await getTestDbClient().query(
        "INSERT INTO time_series(time,metric,value,unit,source) VALUES($1,'synthetic_analysis',$2,'score','manual')",
        [`2026-11-${day}T${hour}:00:00Z`, value],
      )
    }
  }
  const result = await links.personTimeWith(user, p.id, {
    from: '2026-11-20',
    to: '2026-11-23',
    timezone: 'UTC',
    metric: 'synthetic_analysis',
  })
  expect(result.days.map((d) => [d.minutes, d.metric_value])).toEqual([
    [10, 2],
    [20, 4],
    [30, 6],
    [0, null],
  ])
  expect(result.metric_aggregation).toBe('sum')
  expect(result.paired_days).toBe(3)
  expect(result.correlation).toBeCloseTo(1)
  await getTestDbClient().query("UPDATE custom_metrics SET aggregation='avg' WHERE name='synthetic_analysis'")
  const average = await links.personTimeWith(user, p.id, {
    from: '2026-11-20',
    to: '2026-11-23',
    timezone: 'UTC',
    metric: 'synthetic_analysis',
  })
  expect(average.metric_aggregation).toBe('avg')
  expect(average.days.map((d) => d.metric_value)).toEqual([1, 2, 3, null])
})
test('additive link DDL is idempotent and leaves profiles, workbooks and revisions byte-for-byte intact', async () => {
  const p = await person(),
    e = await journal.createJournalEntry(user, { ...entry(), workbook_id: JOURNAL_CATALOG[0]!.id })
  await journal.updateJournalEntry(user, e.id, {
    expected_updated_at: e.updated_at,
    title: 'A revised title',
  })
  const snapshot = async () => ({
    people: (await getTestDbClient().query('SELECT * FROM people ORDER BY id')).rows,
    journal: (await getTestDbClient().query('SELECT * FROM journal_entries ORDER BY id')).rows,
    revisions: (await getTestDbClient().query('SELECT * FROM journal_revisions ORDER BY id')).rows,
  })
  const before = await snapshot()
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const sql of Object.values(privateLinkTables)) await getTestDbClient().query(sql)
  }
  expect(await snapshot()).toEqual(before)
  expect((await people.requirePerson(user, p.id)).notes).toBe('Private care narrative')
})
test('tag merge revises live and trashed entries, neighbors skip trash, restoring retains links', async () => {
  const a = await journal.createJournalEntry(user, { ...entry(), tags: ['old', 'new'] }),
    b = await journal.createJournalEntry(user, {
      ...entry(),
      occurred_at: '2026-11-21T12:00:00Z',
      tags: ['old'],
    })
  const trash = await journal.updateJournalEntry(user, b.id, {
    expected_updated_at: b.updated_at,
    deleted: true,
  })
  expect((await journal.getJournalNeighbors(user, a.id)).next).toBeNull()
  expect(await journal.mergeJournalTags(user, { from: 'old', to: 'new' })).toEqual({ updated: 2 })
  expect((await journal.getJournalEntry(user, a.id)).tags).toEqual(['new'])
  const merged = await journal.getJournalEntry(user, b.id)
  expect(merged.deleted_at).toBe(trash.deleted_at)
  expect((await journal.listJournalRevisions(user, a.id))[0].snapshot).toEqual(a)
  const restored = await journal.updateJournalEntry(user, b.id, {
    expected_updated_at: merged.updated_at,
    deleted: false,
  })
  expect((await journal.getJournalNeighbors(user, a.id)).next?.id).toBe(restored.id)
  expect(await journal.mergeJournalTags(user, { from: 'old', to: 'new' })).toEqual({ updated: 0 })
})
