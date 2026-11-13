import { createPersonBodySchema, peopleEventBodySchema } from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { _setDbForUser } from '../db/connection.ts'
import { createRolePool } from '../db/pool.ts'
import {
  startTestDb,
  stopTestDb,
  getTestUser,
  getTestDbClient,
  createTestDatabase,
} from '../test/db-test-helper.ts'
import * as people from './people.ts'
const profile = (name = 'Someone') =>
  createPersonBodySchema.parse({
    name,
    relationship: 'child',
    approximate_age: { value: 3, unit: 'months', as_of: new Date().toISOString().slice(0, 10) },
    needs: ['typical'],
  })
const activity = (start = '2026-01-01T10:00:00Z', end = '2026-01-01T11:00:00Z') =>
  peopleEventBodySchema.parse({
    type: 'shared_activity',
    timestamp: start,
    end_time: end,
    payload: { note: 'private' },
  })
describe('People persistence, isolation, and aggregate correction', () => {
  beforeAll(startTestDb, 120000)
  afterAll(stopTestDb)
  beforeEach(async () => {
    await getTestDbClient().query('TRUNCATE people CASCADE')
  })
  test('rejects a stale editor snapshot without losing the first edit', async () => {
    const user = getTestUser()
    const original = await people.createPerson(user, profile())
    const first = await people.updatePerson(user, original.id, {
      name: 'First editor',
      expected_updated_at: original.updated_at,
    })
    expect(first.updated_at).not.toBe(original.updated_at)
    await expect(
      people.updatePerson(user, original.id, {
        name: 'Stale editor',
        expected_updated_at: original.updated_at,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect((await people.getDashboard(user, original.id)).person.name).toBe('First editor')
    await expect(
      people.updatePerson(user, original.id, { notes: 'Legacy client still supported' }),
    ).resolves.toBeDefined()
  })
  test('empty account, create, edit and recompute without history loss', async () => {
    const user = getTestUser()
    expect(await people.listPeople(user)).toEqual([])
    const p = await people.createPerson(user, profile())
    await people.createEvent(user, p.id, activity())
    expect((await people.getDashboard(user, p.id)).context.age_months).toBe(3)
    await people.updatePerson(user, p.id, {
      approximate_age: { value: 9, unit: 'years', as_of: new Date().toISOString().slice(0, 10) },
    })
    const d = await people.getDashboard(user, p.id)
    expect(d.context.age_years).toBe(9)
    expect(d.metrics.some((m) => m.id === 'feeding')).toBe(false)
    expect(d.recent_activity).toHaveLength(1)
  })
  test('overlaps, event correction/deletion, revision and projections remain consistent', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile())
    const a = await people.createEvent(user, p.id, activity())
    const b = await people.createEvent(user, p.id, activity('2026-01-01T10:30:00Z', '2026-01-01T11:30:00Z'))
    expect((await people.getDashboard(user, p.id)).shared_time_minutes).toBe(90)
    const edited = await people.updateEvent(user, p.id, b.id, { end_time: '2026-01-01T12:00:00Z' })
    expect(edited.revision).toBe(2)
    expect((await people.getDashboard(user, p.id)).shared_time_minutes).toBe(120)
    await people.deleteEvent(user, p.id, a.id)
    expect((await people.getDashboard(user, p.id)).shared_time_minutes).toBe(90)
    const points = await getTestDbClient().query(
      "SELECT value FROM people_metric_points WHERE person_id=$1 AND metric LIKE '%_elapsed'",
      [p.id],
    )
    expect(points.rows[0].value).toBe(90)
    expect((await getTestDbClient().query("SELECT * FROM time_series WHERE metric LIKE 'p_%'")).rows).toEqual(
      [],
    )
  })
  test('delete cascades only owned rows; recreation has fresh identity', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile()),
      other = await people.createPerson(user, profile('Other'))
    await people.createEvent(user, p.id, activity())
    await people.createEvent(user, other.id, activity())
    const g = (await people.getGuidance(user, p.id))[0]
    await people.setFeedback(user, p.id, g.id, { action: 'dismissed', version: g.version })
    await people.deletePerson(user, p.id)
    for (const table of ['people_events', 'people_feedback', 'people_metric_points']) {
      expect(
        (await getTestDbClient().query(`SELECT * FROM ${table} WHERE person_id=$1`, [p.id])).rows,
      ).toEqual([])
    }
    expect(await people.listEvents(user, other.id)).toHaveLength(1)
    const recreated = await people.createPerson(user, profile())
    expect(recreated.id).not.toBe(p.id)
    expect(await people.listEvents(user, recreated.id)).toEqual([])
  })
  test('cannot mutate other person event or malformed identifier', async () => {
    const user = getTestUser(),
      a = await people.createPerson(user, profile()),
      b = await people.createPerson(user, profile())
    const e = await people.createEvent(user, a.id, activity())
    await expect(people.updateEvent(user, b.id, e.id, { payload: { note: 'bad' } })).rejects.toMatchObject({
      status: 404,
    })
    await expect(people.deleteEvent(user, b.id, e.id)).rejects.toMatchObject({ status: 404 })
    await expect(people.requirePerson(user, 'not-uuid')).rejects.toMatchObject({ status: 400 })
    await expect(people.requirePerson(user, randomUUID())).rejects.toMatchObject({ status: 404 })
  })
  test('owner database boundary denies reads, updates, and event writes', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile()),
      otherDb = await createTestDatabase(),
      pool = createRolePool({ connectionString: otherDb.uri, max: 2 })
    _setDbForUser('other_people_user', pool)
    try {
      await people.updatePerson(user, p.id, {
        important_dates: [
          { id: randomUUID(), label: 'Private date', month: 7, day: 1, recurs_annually: true },
        ],
      })
      expect(await people.getPeopleCalendar(user, { from: '2026-01-01', to: '2026-12-31' })).toHaveLength(1)
      expect(await people.listPeople('other_people_user')).toEqual([])
      expect(
        await people.getPeopleCalendar('other_people_user', { from: '2026-01-01', to: '2026-12-31' }),
      ).toEqual([])
      await expect(people.requirePerson('other_people_user', p.id)).rejects.toMatchObject({ status: 404 })
      await expect(people.updatePerson('other_people_user', p.id, { name: 'bad' })).rejects.toMatchObject({
        status: 404,
      })
      await expect(people.createEvent('other_people_user', p.id, activity())).rejects.toMatchObject({
        status: 404,
      })
      await expect(people.deletePerson('other_people_user', p.id)).rejects.toMatchObject({ status: 404 })
    } finally {
      await pool.end()
      await otherDb.drop()
    }
  }, 30000)
  test('retained corrected age does not block profile edits after age two', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, { ...profile(), corrected_age_weeks: 4 })
    const updated = await people.updatePerson(user, p.id, {
      approximate_age: { value: 9, unit: 'years', as_of: new Date().toISOString().slice(0, 10) },
    })
    expect(updated.corrected_age_weeks).toBe(4)
    await people.updatePerson(user, p.id, { notes: 'History retained' })
    expect((await people.getDashboard(user, p.id)).context.developmental_age_months).toBe(108)
  })
  test('numeric observations retain units and reject unpaired values', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile())
    await expect(
      people.createEvent(
        user,
        p.id,
        peopleEventBodySchema.parse({
          type: 'feeding',
          timestamp: '2026-01-01T00:00:00Z',
          payload: { value: 20 },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'feeding',
        timestamp: '2026-01-01T00:00:00Z',
        payload: { value: 20, unit: 'ml' },
      }),
    )
    await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'feeding',
        timestamp: '2026-01-01T00:00:00Z',
        payload: { value: 2, unit: 'oz' },
      }),
    )
    const metrics = await people.getMetrics(user, p.id)
    expect(metrics.find((m) => m.id === 'feeding:ml')?.value).toBe(20)
    expect(metrics.find((m) => m.id === 'feeding:oz')?.value).toBe(2)
    const rows = await getTestDbClient().query(
      'SELECT unit,value FROM people_metric_points WHERE person_id=$1 ORDER BY unit',
      [p.id],
    )
    expect(rows.rows).toEqual([
      { unit: 'ml', value: 20 },
      { unit: 'oz', value: 2 },
    ])
  })
  test('explicit replacement payload clears numeric values and refreshes projections', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile())
    const event = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'feeding',
        timestamp: '2026-01-01T00:00:00Z',
        payload: { value: 20, unit: 'ml', note: 'Before' },
      }),
    )
    const updated = await people.updateEvent(user, p.id, event.id, { payload: { note: 'After' } })
    expect(updated.payload).toEqual({ note: 'After' })
    expect((await people.getMetrics(user, p.id)).find((m) => m.id === 'feeding:ml')).toBeUndefined()
    expect(
      (
        await getTestDbClient().query('SELECT unit,value FROM people_metric_points WHERE person_id=$1', [
          p.id,
        ])
      ).rows,
    ).toEqual([{ unit: 'events', value: 1 }])
  })
  test('observation context survives profile corrections and ignores forged metadata', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile())
    const guidance = (await people.getGuidance(user, p.id)).find((g) => g.checklist_age_months === 2)!
    const timestamp = new Date().toISOString()
    const event = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'observation',
        timestamp,
        payload: {
          note: 'Original',
          guidance_id: guidance.id,
          guidance_version: 'forged',
          observation_age_days: 99999,
        },
      }),
    )
    expect(event.payload.guidance_version).toBe(guidance.version)
    expect(event.payload.observation_age_days).not.toBe(99999)
    // Simulate an observation recorded against a prior installed catalog release.
    await getTestDbClient().query(
      "UPDATE people_events SET event=jsonb_set(event,'{payload,guidance_version}',to_jsonb($2::text)) WHERE id=$1",
      [event.id, 'prior-release'],
    )
    event.payload.guidance_version = 'prior-release'

    await people.updatePerson(user, p.id, {
      approximate_age: { value: 9, unit: 'years', as_of: timestamp.slice(0, 10) },
    })
    // A browser submits the whole form, including its unchanged timestamp.
    const edited = await people.updateEvent(user, p.id, event.id, {
      timestamp,
      payload: {
        note: 'Edited',
        guidance_id: guidance.id,
        guidance_version: 'malicious',
        observation_age_days: 1,
      },
    })
    expect(edited.payload.observation_age_days).toBe(event.payload.observation_age_days)
    expect(edited.payload.guidance_version).toBe(event.payload.guidance_version)
    const offsetEquivalent = timestamp.replace('Z', '+00:00')
    const again = await people.updateEvent(user, p.id, event.id, {
      timestamp: offsetEquivalent,
      payload: { note: 'Edited again', guidance_id: guidance.id },
    })
    expect(again.payload.observation_age_days).toBe(event.payload.observation_age_days)
    expect(again.payload.guidance_version).toBe(event.payload.guidance_version)
    const moved = await people.updateEvent(user, p.id, event.id, {
      timestamp: new Date(Date.parse(timestamp) - 86400000).toISOString(),
    })
    expect(moved.payload.observation_age_days).toBeGreaterThan(3000)
    expect(moved.payload.guidance_version).toBe(event.payload.guidance_version)
    const cleared = await people.updateEvent(user, p.id, event.id, {
      payload: { note: 'Remove guidance', guidance_version: 'malicious', observation_age_days: 1 },
    })
    expect(cleared.payload.guidance_version).toBeUndefined()
    expect(cleared.payload.observation_age_days).toBe(moved.payload.observation_age_days)
    const changedType = await people.updateEvent(user, p.id, event.id, {
      type: 'reflection',
      payload: {
        note: 'Reflection',
        guidance_id: guidance.id,
        guidance_version: 'malicious',
        observation_age_days: 1,
      },
    })
    expect(changedType.payload).toEqual({ note: 'Reflection' })
    const newObservation = await people.updateEvent(user, p.id, event.id, {
      type: 'observation',
      payload: { guidance_id: 'cdc-checklist-4m', guidance_version: 'malicious', observation_age_days: 1 },
    })
    expect(newObservation.payload.observation_age_days).toBeGreaterThan(3000)
    expect(newObservation.payload.guidance_version).not.toBe('malicious')
  })
  test('partial profile updates preserve every omitted preference', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, {
        ...profile(),
        corrected_age_weeks: 4,
        statuses: ['established'],
        goals: ['Goal'],
        interests: ['Interest'],
        notes: 'Original',
        enabled_metrics: ['sleep'],
        hidden_modules: ['shared_activities'],
      })
    const updated = await people.updatePerson(user, p.id, { name: 'New name' })
    expect(updated).toMatchObject({
      name: 'New name',
      corrected_age_weeks: 4,
      statuses: ['established'],
      goals: ['Goal'],
      interests: ['Interest'],
      notes: 'Original',
      enabled_metrics: ['sleep'],
      hidden_modules: ['shared_activities'],
    })
  })
  test('optional dates, gender and meeting details round-trip; omitted patches preserve and explicit clears remove', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile())
    const important_dates = [
      { id: randomUUID(), label: 'Birthday', month: 2, day: 29, recurs_annually: true },
    ]
    const gender = { identity: 'nonbinary' as const, pronouns: 'they/them' }
    const met = { place: 'Community garden', date: '2020-05-01', story: 'First conversation' }
    await people.updatePerson(user, p.id, { important_dates, gender, met })
    await expect(
      people.createEvent(
        user,
        p.id,
        peopleEventBodySchema.parse({
          type: 'journal',
          timestamp: '2026-01-01T00:00:00Z',
          payload: { note: '   ' },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    const journal = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'journal',
        timestamp: '2026-01-01T12:00:00Z',
        payload: { title: 'A good conversation', note: 'Private reflection' },
      }),
    )
    const memory = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'memory',
        timestamp: '2026-01-02T12:00:00Z',
        end_time: '2026-01-02T13:00:00Z',
        payload: { title: 'A walk', location: 'Park', note: 'Shared memory' },
      }),
    )
    expect(await people.updatePerson(user, p.id, { name: 'Edited' })).toMatchObject({
      important_dates,
      gender,
      met,
    })
    const dashboard = await people.getDashboard(user, p.id)
    expect(dashboard.event_types.map((e) => e.value)).toEqual(expect.arrayContaining(['journal', 'memory']))
    expect(dashboard.shared_time_minutes).toBe(0)
    expect(dashboard.metrics.every((m) => m.value === null)).toBe(true)
    expect(
      (await getTestDbClient().query('SELECT * FROM people_metric_points WHERE person_id=$1', [p.id])).rows,
    ).toEqual([])
    expect(
      (
        await people.updateEvent(user, p.id, memory.id, {
          payload: { title: 'Updated memory', location: 'Another park', note: 'Edited' },
        })
      ).revision,
    ).toBe(2)
    const cleared = await people.updatePerson(user, p.id, { gender: null, met: null, important_dates: [] })
    expect(cleared).toMatchObject({ gender: null, met: null, important_dates: [] })
    expect(await people.listEvents(user, p.id)).toHaveLength(2)
    await people.deleteEvent(user, p.id, journal.id)
    expect(await people.listEvents(user, p.id)).toHaveLength(1)
  })
  test.each(['child', 'parent', 'lover', 'spouse', 'friend'] as const)(
    'gender context recomputes for %s without changing history',
    async (relationship) => {
      const user = getTestUser(),
        p = await people.createPerson(user, {
          ...profile(),
          relationship,
          approximate_age: { value: 35, unit: 'years', as_of: new Date().toISOString().slice(0, 10) },
        })
      await people.createEvent(
        user,
        p.id,
        peopleEventBodySchema.parse({
          type: 'memory',
          timestamp: '2026-01-01T12:00:00Z',
          payload: { note: 'Preserve this memory' },
        }),
      )
      const before = (await people.getGuidance(user, p.id)).map((g) => g.id)
      await people.updatePerson(user, p.id, { gender: { identity: 'woman' } })
      const withGender = await people.getDashboard(user, p.id)
      expect(withGender.contextual_guidance.length).toBeGreaterThan(0)
      expect(withGender.contextual_guidance.every((g) => g.genders?.includes('woman'))).toBe(true)
      const featuredIds = [...withGender.current_guidance, ...withGender.practical_opportunities].map(
        (g) => g.id,
      )
      expect(withGender.contextual_guidance.every((g) => !featuredIds.includes(g.id))).toBe(true)
      await people.updatePerson(user, p.id, { gender: null })
      expect((await people.getGuidance(user, p.id)).map((g) => g.id)).toEqual(before)
      expect(await people.listEvents(user, p.id)).toHaveLength(1)
    },
  )
  test('parent goals support lifecycle and target dates without metric enabling creating a goal', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, { ...profile(), relationship: 'parent' })
    await people.updatePerson(user, p.id, { enabled_metrics: ['goal'] })
    const empty = await people.getDashboard(user, p.id)
    expect(empty.goals).toEqual([])
    expect(empty.event_types).toContainEqual({ value: 'goal', label: 'Add goal' })
    expect(empty.metrics.find((m) => m.id === 'goal')).toMatchObject({
      enabled: true,
      value: null,
      label: 'Goals',
    })
    await expect(
      people.createEvent(
        user,
        p.id,
        peopleEventBodySchema.parse({
          type: 'goal',
          timestamp: '2026-01-01T12:00:00Z',
          payload: { title: '  ', note: '  ' },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    const goal = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'goal',
        timestamp: '2026-01-01T12:00:00Z',
        payload: { title: 'Plan a visit', note: 'Choose a date together', target_date: '2028-02-29' },
      }),
    )
    expect(goal.payload.goal_status).toBeUndefined()
    expect((await people.getDashboard(user, p.id)).goals[0].payload).toMatchObject({
      goal_status: 'active',
      target_date: '2028-02-29',
    })
    expect((await people.listEvents(user, p.id))[0].payload.goal_status).toBeUndefined()
    for (const status of ['completed', 'paused', 'active'] as const) {
      const edited = await people.updateEvent(user, p.id, goal.id, {
        payload: { ...goal.payload, goal_status: status },
      })
      expect(edited.payload).toMatchObject({
        goal_status: status,
        note: 'Choose a date together',
        target_date: '2028-02-29',
      })
      expect((await people.getDashboard(user, p.id)).metrics.find((m) => m.id === 'goal')?.value).toBe(1)
    }
    await expect(
      people.updateEvent(user, p.id, goal.id, { payload: { ...goal.payload, target_date: '2027-02-29' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      people.updateEvent(user, p.id, goal.id, { payload: { goal_status: 'completed' } }),
    ).rejects.toMatchObject({ status: 400 })
    const noTarget = await people.updateEvent(user, p.id, goal.id, {
      payload: { title: 'Plan a visit', goal_status: 'paused' },
    })
    expect(noTarget.payload.target_date).toBeUndefined()
  })
  test('all goals remain visible beyond recent history and normalize legacy status without database writes', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile())
    const legacy = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'goal',
        timestamp: '2000-01-01T00:00:00Z',
        payload: { note: 'Legacy note-only goal' },
      }),
    )
    const future = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'goal',
        timestamp: '2099-01-01T00:00:00Z',
        payload: { title: 'Future goal', goal_status: 'paused' },
      }),
    )
    await getTestDbClient().query(
      "INSERT INTO people_events(id,person_id,actor,event) SELECT gen_random_uuid(),$1,$2,jsonb_build_object('type','contact','timestamp',NOW()-i*interval '1 minute','source','manual','payload',jsonb_build_object('note','Recent contact')) FROM generate_series(1,55) AS i",
      [p.id, user],
    )
    const dashboard = await people.getDashboard(user, p.id)
    expect(dashboard.recent_activity).toHaveLength(50)
    expect(dashboard.recent_activity.some((event) => event.id === legacy.id)).toBe(false)
    expect(dashboard.goals.map((goal) => goal.id)).toEqual(expect.arrayContaining([legacy.id, future.id]))
    expect(dashboard.goals.find((goal) => goal.id === legacy.id)?.payload).toEqual({
      note: 'Legacy note-only goal',
      goal_status: 'active',
    })
    expect((await people.listEvents(user, p.id)).find((event) => event.id === legacy.id)?.payload).toEqual({
      note: 'Legacy note-only goal',
    })
    const blankId = randomUUID()
    await getTestDbClient().query('INSERT INTO people_events(id,person_id,actor,event) VALUES($1,$2,$3,$4)', [
      blankId,
      p.id,
      user,
      { type: 'goal', timestamp: '2000-01-01T00:00:00Z', source: 'manual', payload: {} },
    ])
    expect(
      (await people.updateEvent(user, p.id, blankId, { payload: { goal_status: 'paused' } })).payload,
    ).toEqual({ goal_status: 'paused' })
  })
  test('private calendar updates dynamically from profile dates without creating records', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, {
        ...profile(),
        date_of_birth: '1990-04-20',
        approximate_age: null,
        important_dates: [
          { id: randomUUID(), label: 'Birthday', month: 4, day: 20, recurs_annually: true },
          {
            id: randomUUID(),
            label: 'Our anniversary',
            kind: 'anniversary',
            month: 5,
            day: 3,
            year: 2020,
            recurs_annually: true,
          },
        ],
      })
    const range = { from: '2026-01-01', to: '2026-12-31' }
    const before = await people.getPeopleCalendar(user, range)
    expect(before).toHaveLength(2)
    expect(
      (await people.getDashboard(user, p.id)).important_dates.every(
        (date) => date.kind && date.ideas?.length,
      ),
    ).toBe(true)
    expect(before.map((event) => event.kind).sort()).toEqual(['anniversary', 'birthday'])
    expect(before.every((event) => event.person_id === p.id && event.ideas.length > 0)).toBe(true)
    expect(await people.listEvents(user, p.id)).toEqual([])
    expect(
      (await getTestDbClient().query('SELECT * FROM people_metric_points WHERE person_id=$1', [p.id])).rows,
    ).toEqual([])
    await people.updatePerson(user, p.id, { name: 'New name', important_dates: [] })
    const after = await people.getPeopleCalendar(user, range)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ kind: 'birthday', person_name: 'New name' })
    expect(after[0].id).toBe(before.find((event) => event.kind === 'birthday')?.id)
    await people.updatePerson(user, p.id, {
      date_of_birth: null,
      approximate_age: { value: 35, unit: 'years', as_of: '2026-01-01' },
    })
    expect(await people.getPeopleCalendar(user, range)).toEqual([])
    await expect(people.getPeopleCalendar(user, { from: 'invalid', to: '2026-12-31' })).rejects.toMatchObject(
      { status: 400 },
    )
    await expect(
      people.getPeopleCalendar(user, { from: '2026-12-31', to: '2026-01-01' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      people.getPeopleCalendar(user, { from: '2026-01-01', to: '2040-01-01' }),
    ).rejects.toMatchObject({ status: 400 })
  })
  test('invalid DOB and unrealistic approximate ages rejected', async () => {
    const user = getTestUser()
    await expect(
      people.createPerson(user, { ...profile(), date_of_birth: '2026-02-30', approximate_age: null }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      people.createPerson(user, { ...profile(), date_of_birth: '2999-01-01', approximate_age: null }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      people.createPerson(user, {
        ...profile(),
        approximate_age: { value: 15000, unit: 'years', as_of: '2026-01-01' },
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
  test('feedback preserves exploration and requires current version', async () => {
    const user = getTestUser(),
      p = await people.createPerson(user, profile()),
      all = await people.getGuidance(user, p.id),
      g = all[0]
    await people.setFeedback(user, p.id, g.id, { action: 'dismissed', version: g.version })
    const after = await people.getGuidance(user, p.id)
    expect(after).toHaveLength(all.length)
    expect(after.find((x) => x.id === g.id)?.feedback).toBe('dismissed')
    await expect(
      people.setFeedback(user, p.id, g.id, { action: 'completed', version: 'old' }),
    ).rejects.toMatchObject({ status: 400 })
  })
  test('typed observations preserve legacy data, validate context and clear safely', async () => {
    const user = getTestUser()
    const p = await people.createPerson(user, profile())
    const timestamp = new Date().toISOString()
    const body = (type: 'growth' | 'diaper' | 'contact', payload: Record<string, unknown>) =>
      peopleEventBodySchema.parse({ type, timestamp, payload })
    const old = await people.createEvent(user, p.id, body('growth', { value: 50, unit: 'cm' }))
    const typed = await people.createEvent(
      user,
      p.id,
      body('growth', { value: 40, unit: 'cm', measurement_type: 'head_circumference' }),
    )
    await people.updateEvent(user, p.id, typed.id, { timestamp })
    expect(
      (await people.listEvents(user, p.id)).find((e) => e.id === typed.id)?.payload.measurement_type,
    ).toBe('head_circumference')
    await expect(
      people.createEvent(user, p.id, body('contact', { diaper_type: 'wet' })),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      people.createEvent(user, p.id, body('growth', { measurement_type: 'weight' })),
    ).rejects.toMatchObject({ status: 400 })
    const metrics = await people.getMetrics(user, p.id)
    expect(metrics.find((m) => m.id === 'growth:cm')?.value).toBe(50)
    expect(metrics.find((m) => m.id === 'recorded:growth:head_circumference:cm')?.value).toBe(40)
    await people.updateEvent(user, p.id, typed.id, { payload: { note: 'Cleared' } })
    expect(
      (await people.getMetrics(user, p.id)).some((m) => m.id === 'recorded:growth:head_circumference:cm'),
    ).toBe(false)
    expect((await people.listEvents(user, p.id)).find((e) => e.id === old.id)?.payload).toEqual({
      value: 50,
      unit: 'cm',
    })
  })
  test('child guide keeps tagged feedback and includes its sources independently of hidden modules', async () => {
    const user = getTestUser()
    const p = await people.createPerson(user, { ...profile(), hidden_modules: ['development'] })
    const initial = await people.getDashboard(user, p.id)
    expect(initial.child_guide?.title).toBe('Super Baby: play, notice and care')
    expect(initial.child_guide?.groups.map((g) => g.id)).toEqual(['safety', 'help', 'play', 'watch'])
    const records = initial.child_guide!.groups.flatMap((g) => g.records)
    expect(records.length).toBeGreaterThan(3)
    const record = records[0]
    await people.setFeedback(user, p.id, record.id, { action: 'dismissed', version: record.version })
    const after = await people.getDashboard(user, p.id)
    expect(
      after.child_guide!.groups.flatMap((g) => g.records).find((g) => g.id === record.id)?.feedback,
    ).toBe('dismissed')
    expect(record.evidence_ids.every((id) => after.sources.some((source) => source.id === id))).toBe(true)
    expect(after.current_guidance.every((g) => !g.child_section)).toBe(true)
    await people.updatePerson(user, p.id, {
      approximate_age: { value: 12, unit: 'months', as_of: new Date().toISOString().slice(0, 10) },
    })
    expect((await people.getDashboard(user, p.id)).child_guide?.title).toBe('Child development and care')
    await people.updatePerson(user, p.id, {
      approximate_age: { value: 30, unit: 'years', as_of: new Date().toISOString().slice(0, 10) },
    })
    expect((await people.getDashboard(user, p.id)).child_guide).toBeNull()
  })
  test('care episode lifecycle preserves history and isolated metrics through consent withdrawal', async () => {
    const user = getTestUser(),
      episode = {
        id: randomUUID(),
        kind: 'depressed' as const,
        lifecycle: 'active' as const,
        start_date: '2026-01-01',
        information_source: 'self_shared' as const,
        tracking_agreed: true,
      }
    const p = await people.createPerson(user, { ...profile(), status_episodes: [episode] })
    const log = await people.createEvent(
      user,
      p.id,
      peopleEventBodySchema.parse({
        type: 'observation',
        timestamp: new Date().toISOString(),
        payload: {
          status_episode_id: episode.id,
          care_metric: 'mood',
          information_source: 'self_shared',
          value: 0,
          unit: 'rating',
        },
      }),
    )
    expect(
      (await people.getMetrics(user, p.id)).find((m) => m.id === `care:${episode.id}:mood:latest`)?.value,
    ).toBe(0)
    expect((await people.getMetrics(user, p.id)).some((m) => m.id === 'observation:rating')).toBe(false)
    await people.updatePerson(user, p.id, { notes: 'Unrelated' })
    expect((await people.requirePerson(user, p.id)).status_episodes?.[0].id).toBe(episode.id)
    await expect(people.updatePerson(user, p.id, { status_episodes: [] })).rejects.toMatchObject({
      status: 400,
    })
    await people.updatePerson(user, p.id, {
      status_episodes: [{ ...episode, lifecycle: 'resolved', tracking_agreed: false }],
    })
    expect((await people.getMetrics(user, p.id)).some((m) => m.status_episode_id === episode.id)).toBe(false)
    await people.updateEvent(user, p.id, log.id, { payload: { ...log.payload, note: 'Correction' } })
    await expect(
      people.createEvent(
        user,
        p.id,
        peopleEventBodySchema.parse({
          type: 'observation',
          timestamp: new Date().toISOString(),
          payload: log.payload,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    const saved = await people.requirePerson(user, p.id)
    expect(saved.status_episodes?.[0].transition_history?.[0]).toMatchObject({
      from: 'active',
      to: 'resolved',
    })
    await people.updatePerson(user, p.id, {
      enabled_metrics: [`care:${episode.id}:mood:latest`],
      status_episodes: saved.status_episodes!.map((e) => ({ ...e, retain_metrics: true })),
    })
    expect(
      (await people.getMetrics(user, p.id)).find((m) => m.id === `care:${episode.id}:mood:latest`)?.value,
    ).toBe(0)
    expect(await people.listEvents(user, p.id)).toHaveLength(1)
    const other = await people.createPerson(user, profile('Other'))
    await expect(
      people.createEvent(
        user,
        other.id,
        peopleEventBodySchema.parse({
          type: 'observation',
          timestamp: new Date().toISOString(),
          payload: log.payload,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    await expect(people.getPeopleHelpTree(user, { person_id: randomUUID() })).rejects.toMatchObject({
      status: 404,
    })
    const tree = await people.getPeopleHelpTree(user, { person_id: p.id })
    expect(tree.evaluations?.length).toBe(tree.guidance.length)
    expect(tree.status_definitions).toHaveLength(8)
  })
})
