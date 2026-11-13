import type { Person, PeopleEvent } from '@aurboda/api-spec'

import { personSchema, updatePersonBodySchema, updatePeopleEventBodySchema } from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { peopleCatalog } from './people-catalog.ts'
import {
  peopleContext,
  matchGuidance,
  metricDefinitions,
  dashboardModules,
  unionMinutes,
} from './people-rules.ts'
const now = new Date('2026-11-11T12:00:00Z')
const person = (
  relationship: Person['relationship'],
  years: number,
  needs = ['typical'],
  statuses: string[] = [],
): Person =>
  personSchema.parse({
    id: '25b9bd1e-3ef9-4343-a862-b99f589e0ab4',
    name: 'Private',
    relationship,
    approximate_age: { value: years, unit: 'years', as_of: '2026-11-11' },
    needs,
    statuses,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
test('patch schemas never populate creation defaults for omitted fields', () => {
  expect(updatePersonBodySchema.parse({})).toEqual({})
  expect(updatePeopleEventBodySchema.parse({})).toEqual({})
  expect(updatePersonBodySchema.parse({ notes: 'Edit' })).toEqual({ notes: 'Edit' })
  expect(updatePeopleEventBodySchema.parse({ timestamp: '2026-01-01T00:00:00Z' })).toEqual({
    timestamp: '2026-01-01T00:00:00Z',
  })
})
describe('deterministic People contexts', () => {
  test('three months uses official two/four month context and optional infant metrics', () => {
    const p = person('child', 0)
    p.approximate_age = { value: 3, unit: 'months', as_of: '2026-11-11' }
    const c = peopleContext(p, now)
    expect(c.previous_checklist_months).toBe(2)
    expect(c.next_checklist_months).toBe(4)
    expect(c.focus).toContain('early communication')
    const matches = matchGuidance(p, c, peopleCatalog)
    expect(matches.some((g) => g.guidance_type === 'safety')).toBe(true)
    expect(matches.some((g) => g.checklist_age_months === 2)).toBe(true)
    expect(matches.some((g) => g.checklist_age_months === 4)).toBe(false)
    expect(metricDefinitions(p, c, []).some((m) => m.id === 'feeding')).toBe(true)
    expect(metricDefinitions(p, c, []).every((m) => !m.enabled && m.value === null)).toBe(true)
  })
  test.each([9, 16])('child age %i retires infant metrics and official early checkpoints', (age) => {
    const p = person('child', age),
      c = peopleContext(p, now)
    expect(c.previous_checklist_months).toBeNull()
    expect(c.next_checklist_months).toBeNull()
    expect(metricDefinitions(p, c, []).some((m) => ['feeding', 'diaper'].includes(m.id))).toBe(false)
    expect(matchGuidance(p, c, peopleCatalog).some((g) => g.checklist_age_months)).toBe(false)
    expect(matchGuidance(p, c, peopleCatalog).length).toBeGreaterThan(0)
  })
  test('independent parent and explicit care differ', () => {
    const p = person('parent', 68, ['independent'])
    expect(dashboardModules(p, peopleContext(p, now)).some((m) => m.id === 'care_coordination')).toBe(false)
    expect(metricDefinitions(p, peopleContext(p, now), []).some((m) => m.id === 'care')).toBe(false)
    const care = person('parent', 78, ['regular_caregiving'])
    expect(dashboardModules(care, peopleContext(care, now)).some((m) => m.id === 'care_coordination')).toBe(
      true,
    )
    expect(
      matchGuidance(care, peopleContext(care, now), peopleCatalog).some((g) => g.guidance_type === 'care'),
    ).toBe(true)
  })
  test.each([
    ['spouse', 34, 'relationship_maintenance', 'established'],
    ['lover', 28, 'building_connection', 'long_distance'],
    ['friend', 35, 'maintain_friendship', 'reconnect'],
  ] as const)('%s guidance and tracking', (relationship, age, need, status) => {
    const p = person(relationship, age, [need], [status]),
      c = peopleContext(p, now)
    expect(matchGuidance(p, c, peopleCatalog).length).toBeGreaterThan(0)
    expect(metricDefinitions(p, c, []).some((m) => m.id === 'feeding')).toBe(false)
    expect(dashboardModules(p, c).some((m) => m.id === 'household_coordination')).toBe(
      relationship === 'spouse',
    )
  })
  test('adult child gets independence-respecting connection modules', () => {
    const p = person('child', 30)
    expect(dashboardModules(p, peopleContext(p, now)).map((m) => m.id)).toEqual([
      'connection',
      'shared_activities',
    ])
  })
  test('calendar boundaries and corrected age do not move chronological safety', () => {
    const p = person('child', 0)
    p.approximate_age = null
    p.date_of_birth = '2024-02-29'
    expect(peopleContext(p, new Date('2025-02-28T00:00:00Z')).age_years).toBe(0)
    p.date_of_birth = '2026-08-11'
    p.corrected_age_weeks = 4
    const c = peopleContext(p, now)
    expect(c.age_months).toBe(3)
    expect(c.developmental_age_months).toBe(2)
    expect(c.previous_checklist_months).toBe(2)
    p.date_of_birth = '2024-11-11'
    expect(peopleContext(p, now).developmental_age_months).toBe(24)
  })
  test('feedback never removes applicable exploration or safety and expires/version changes', () => {
    const p = person('child', 0)
    p.approximate_age = { value: 3, unit: 'months', as_of: '2026-11-11' }
    const c = peopleContext(p, now),
      g = matchGuidance(p, c, peopleCatalog)[0]
    const f = { guidance_id: g.id, version: g.version, action: 'dismissed' as const, recorded_at: now }
    expect(matchGuidance(p, c, peopleCatalog, [f], now).find((x) => x.id === g.id)?.feedback).toBe(
      'dismissed',
    )
    expect(
      matchGuidance(p, c, peopleCatalog, [{ ...f, version: 'old' }], now).find((x) => x.id === g.id)
        ?.feedback,
    ).toBeUndefined()
    if (g.recurring) {
      expect(
        matchGuidance(
          p,
          c,
          peopleCatalog,
          [{ ...f, recorded_at: new Date(now.getTime() - (g.review_interval + 1) * 86400000) }],
          now,
        ).find((x) => x.id === g.id)?.feedback,
      ).toBeUndefined()
    }
  })
  test('union of overlapping intervals counts elapsed time once', () => {
    const e = (a: string, b: string) =>
      ({
        type: 'shared_activity',
        timestamp: `2026-11-11T${a}:00Z`,
        end_time: `2026-11-11T${b}:00Z`,
      }) as PeopleEvent
    expect(
      unionMinutes(
        [e('10:00', '11:00'), e('10:30', '11:30'), e('12:00', '12:15')],
        new Date('2026-11-12T00:00:00Z'),
      ),
    ).toBe(105)
  })
  test('minor romantic relationships cannot match adult romantic frameworks', () => {
    const p = person('lover', 16, ['relationship_maintenance'])
    expect(matchGuidance(p, peopleContext(p, now), peopleCatalog)).toEqual([])
  })
})

test.each(['child', 'parent', 'lover', 'spouse', 'friend'] as const)(
  'explicit gender matching for %s never changes chronological age or general guidance',
  (relationship) => {
    const p = person(relationship, 30),
      context = peopleContext(p, now)
    const base = {
      ...peopleCatalog[0],
      id: 'general-test',
      relationship_types: [relationship],
      min_age: 0,
      max_age: 151,
      age_unit: 'years' as const,
      needs: [],
      statuses: [],
      interests: [],
      goals: [],
      contraindications: [],
      checklist_age_months: undefined,
    }
    const targeted = { ...base, id: 'gender-test', genders: ['woman' as const] }
    const catalog = [base, targeted]
    expect(matchGuidance(p, context, catalog).map((g) => g.id)).toEqual(['general-test'])
    for (const identity of ['man', 'nonbinary', 'self_described', 'prefer_not_to_say'] as const) {
      expect(matchGuidance({ ...p, gender: { identity } }, context, catalog).map((g) => g.id)).toEqual([
        'general-test',
      ])
    }
    const woman = { ...p, gender: { identity: 'woman' as const } }
    const matches = matchGuidance(woman, context, catalog)
    expect(matches.map((g) => g.id).sort()).toEqual(['gender-test', 'general-test'])
    expect(matches.find((g) => g.id === 'gender-test')?.reasons.join(' ')).toContain(
      'explicitly selected gender context: woman',
    )
    expect(peopleContext(woman, now)).toEqual(context)
    expect(matchGuidance({ ...woman, gender: null }, context, catalog).map((g) => g.id)).toEqual([
      'general-test',
    ])
  },
)

test.each(['child', 'parent', 'lover', 'spouse', 'friend'] as const)(
  'goals are optional counters for %s, including parents',
  (relationship) => {
    const p = person(relationship, 35)
    const metric = metricDefinitions(p, peopleContext(p, now), []).find((m) => m.id === 'goal')
    expect(metric).toMatchObject({ label: 'Goals', event_type: 'goal', enabled: false, value: null })
    expect(metric?.description).toContain('does not create a goal or measure progress')
  },
)

describe('useful recorded metric windows', () => {
  const entry = (
    type: PeopleEvent['type'],
    timestamp: string,
    payload: PeopleEvent['payload'] = {},
    end_time?: string,
  ): PeopleEvent => ({
    id: crypto.randomUUID(),
    person_id: crypto.randomUUID(),
    actor: 'test',
    type,
    timestamp,
    payload,
    end_time,
    source: 'manual',
    privacy: 'private',
    revision: 1,
    recorded_at: timestamp,
    updated_at: timestamp,
  })
  const infant = () => person('child', 0)
  const metrics = (events: PeopleEvent[]) =>
    metricDefinitions(infant(), peopleContext(infant(), now), events, now)
  test('clips sleep at both bounds, unions overlaps, and ignores unfinished or future intervals', () => {
    const result = metrics([
      entry('sleep', '2026-11-10T10:00:00Z', {}, '2026-11-10T14:00:00Z'),
      entry('sleep', '2026-11-10T13:00:00Z', {}, '2026-11-10T15:00:00Z'),
      entry('sleep', '2026-11-11T11:00:00Z', {}, '2026-11-11T14:00:00Z'),
      entry('sleep', '2026-11-11T10:00:00Z'),
      entry('sleep', '2026-11-12T10:00:00Z', {}, '2026-11-12T12:00:00Z'),
    ])
    expect(result.find((m) => m.id === 'recorded:sleep:24h')).toMatchObject({
      value: 240,
      window: 'last_24_hours',
      window_start: '2026-11-10T12:00:00.000Z',
    })
    expect(metrics([entry('sleep', '2026-11-11T10:00:00Z')]).find((m) => m.id === 'sleep')?.value).toBeNull()
  })
  test('separates typed and unspecified growth, units, and future entries', () => {
    const result = metrics([
      entry('growth', '2026-11-11T10:00:00Z', { value: 60, unit: 'cm', measurement_type: 'length' }),
      entry('growth', '2026-11-11T10:00:00Z', {
        value: 40,
        unit: 'cm',
        measurement_type: 'head_circumference',
      }),
      entry('growth', '2026-11-11T10:00:00Z', { value: 50, unit: 'cm' }),
      entry('growth', '2026-11-12T10:00:00Z', { value: 70, unit: 'cm', measurement_type: 'length' }),
      entry('feeding', '2026-11-11T10:00:00Z', { value: 0, unit: 'ml' }),
      entry('feeding', '2026-11-11T10:00:00Z', { value: 2, unit: 'oz' }),
      entry('feeding', '2026-11-11T10:00:00Z'),
    ])
    for (const [id, value] of [
      ['recorded:growth:length:cm', 60],
      ['recorded:growth:head_circumference:cm', 40],
      ['growth:cm', 50],
      ['recorded:feeding:24h:ml', 0],
      ['recorded:feeding:24h:oz', 2],
      ['recorded:feeding:24h', 3],
    ] as const) {
      expect(result.find((m) => m.id === id)?.value).toBe(value)
    }
  })
  test('structured diapers and lifecycle counts never infer missing observations', () => {
    const result = metrics([
      entry('diaper', now.toISOString(), { diaper_type: 'mixed' }),
      entry('diaper', now.toISOString()),
      entry('goal', now.toISOString()),
      entry('goal', now.toISOString(), { goal_status: 'completed' }),
    ])
    expect(result.find((m) => m.id === 'recorded:diaper:wet:24h')?.value).toBe(1)
    expect(result.find((m) => m.id === 'recorded:diaper:dirty:24h')?.value).toBe(1)
    expect(result.find((m) => m.id === 'recorded:goal:active')?.value).toBe(1)
    expect(result.find((m) => m.id === 'recorded:goal:completed')?.value).toBe(1)
    expect(result.find((m) => m.id === 'recorded:goal:paused')?.value).toBeNull()
  })
  test.each(['child', 'parent', 'lover', 'spouse', 'friend'] as const)(
    '%s has optional recent contact/shared time',
    (relationship) => {
      const p = person(relationship, 30)
      const result = metricDefinitions(p, peopleContext(p, now), [], now)
      for (const id of ['recorded:contact:7d', 'recorded:shared_activity:7d']) {
        expect(result.find((m) => m.id === id)).toMatchObject({ enabled: false, value: null })
      }
      expect(result.find((m) => m.id === 'recorded:care:7d')).toBeUndefined()
      expect(
        metricDefinitions({ ...p, needs: ['regular_caregiving'] }, peopleContext(p, now), [], now).some(
          (m) => m.id === 'recorded:care:7d',
        ),
      ).toBe(true)
    },
  )
})

test('all recorded intervals include dates before 1970 and new metric IDs cannot collide with legacy units', () => {
  const p = person('child', 0)
  const event = (
    type: PeopleEvent['type'],
    payload: PeopleEvent['payload'],
    timestamp = '2026-11-11T10:00:00Z',
    end_time?: string,
  ): PeopleEvent => ({
    id: crypto.randomUUID(),
    person_id: p.id,
    actor: 'test',
    type,
    payload,
    timestamp,
    end_time,
    source: 'manual',
    privacy: 'private',
    revision: 1,
    recorded_at: timestamp,
    updated_at: timestamp,
  })
  expect(
    unionMinutes([event('shared_activity', {}, '1960-01-01T00:00:00Z', '1960-01-01T01:00:00Z')], now),
  ).toBe(60)
  const metrics = metricDefinitions(
    p,
    peopleContext(p, now),
    [
      event('feeding', { value: 3, unit: '24h' }),
      event('feeding', { value: 4, unit: '24h:ml' }),
      event('growth', { value: 5, unit: 'length:cm' }),
      event('growth', { value: 6, unit: 'cm', measurement_type: 'length' }),
    ],
    now,
  )
  expect(new Set(metrics.map((m) => m.id)).size).toBe(metrics.length)
  expect(metrics.find((m) => m.id === 'feeding:24h')?.value).toBe(3)
  expect(metrics.find((m) => m.id === 'recorded:feeding:24h')?.value).toBe(2)
  expect(metrics.find((m) => m.id === 'growth:length:cm')?.value).toBe(5)
  expect(metrics.find((m) => m.id === 'recorded:growth:length:cm')?.value).toBe(6)
})
