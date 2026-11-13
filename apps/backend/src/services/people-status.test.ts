import type {
  Person,
  PeopleStatusEpisode,
  PeopleEvent,
  PeopleEventBody,
  PeopleGuidance,
} from '@aurboda/api-spec'

import {
  personSchema,
  peopleGuidanceSchema,
  peopleEventBodySchema,
  updatePersonBodySchema,
} from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { matchGuidance, peopleContext, evaluatePeopleGuidance } from './people-rules.ts'
import {
  statusContexts,
  validateStatusEpisodes,
  statusRuleReasons,
  validateCareEvent,
  careMetrics,
  careMilestones,
  peopleStatusDefinitions,
} from './people-status.ts'
const now = new Date('2026-11-12T02:00:00Z')
const episode = (kind: PeopleStatusEpisode['kind'] = 'pregnant'): PeopleStatusEpisode => ({
  id: crypto.randomUUID(),
  kind,
  lifecycle: 'active',
  start_date: '2026-10-01',
  information_source: 'self_shared',
  tracking_agreed: true,
})
const person = (episodes: PeopleStatusEpisode[]): Person =>
  personSchema.parse({
    id: crypto.randomUUID(),
    name: 'Private',
    relationship: 'spouse',
    date_of_birth: '1990-01-01',
    gender: { identity: 'nonbinary' },
    needs: ['relationship_maintenance'],
    status_episodes: episodes,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
const guidance = (extra: Partial<PeopleGuidance>) =>
  peopleGuidanceSchema.parse({
    id: 'test',
    evidence_class: 'practical',
    last_verified: '2026-11-12',
    jurisdiction: 'general',
    title: 'Test',
    relationship_types: ['spouse'],
    min_age: 0,
    max_age: 151,
    age_unit: 'years',
    needs: [],
    statuses: [],
    domains: [],
    priority: 10,
    guidance_type: 'care',
    summary: 'Test',
    practical_actions: [],
    optional_metrics: [],
    evidence_ids: [],
    version: '1',
    active: true,
    contraindications: [],
    review_interval: 30,
    ...extra,
  })
const entry = (
  e: PeopleStatusEpisode,
  payload: PeopleEvent['payload'],
  timestamp = now.toISOString(),
): PeopleEvent & PeopleEventBody => ({
  ...peopleEventBodySchema.parse({
    type: 'observation',
    timestamp,
    payload: { status_episode_id: e.id, ...payload },
  }),
  id: crypto.randomUUID(),
  person_id: crypto.randomUUID(),
  actor: 'owner',
  recorded_at: timestamp,
  updated_at: timestamp,
  revision: 1,
  privacy: 'private',
})
describe('status clocks and lifecycle', () => {
  test.each([
    [0, 'first_trimester'],
    [97, 'first_trimester'],
    [98, 'second_trimester'],
    [195, 'second_trimester'],
    [196, 'third_trimester'],
    [258, 'third_trimester'],
    [259, 'birth_preparation'],
  ] as const)('gestational day %i uses %s', (days, phase) => {
    const e = { ...episode(), gestational_age_days: days, gestational_as_of: '2026-11-11' }
    expect(statusContexts(person([e]), now, 'America/Denver')[0]).toMatchObject({
      gestational_days: days,
      phase,
    })
    expect(e.lifecycle).toBe('active')
  })
  test('timezone dates, leap day, and expired anchors do not change lifecycle', () => {
    const e = { ...episode(), estimated_due_date: '2026-11-11' }
    const p = person([e])
    expect(statusContexts(p, now, 'America/Denver')[0].gestational_days).toBe(280)
    expect(statusContexts(p, now, 'UTC')[0].gestational_days).toBe(281)
    expect(statusContexts(p, new Date('2027-02-01T00:00:00Z'))[0].gestational_days).toBeNull()
    expect(e.lifecycle).toBe('active')
    const leap = { ...episode(), gestational_age_days: 10, gestational_as_of: '2024-02-28' }
    expect(statusContexts(person([leap]), new Date('2024-03-01T12:00:00Z'))[0].gestational_days).toBe(12)
  })
  test('omitted patches preserve episodes, transitions are explicit and referenced episodes cannot disappear', () => {
    expect(updatePersonBodySchema.parse({})).toEqual({})
    const e = episode(),
      old = person([e]),
      changed = person([{ ...e, lifecycle: 'resolved', resolved_date: '2026-11-11', outcome: 'loss' }])
    validateStatusEpisodes(changed, old, [], now)
    expect(changed.status_episodes![0].transition_history).toEqual([
      { from: 'active', to: 'resolved', date: '2026-11-12' },
    ])
    expect(() =>
      validateStatusEpisodes(
        person([]),
        old,
        [entry(e, { care_metric: 'check_in', information_source: 'observed' })],
        now,
      ),
    ).toThrow('Archive')
    expect(() => validateStatusEpisodes(person([{ ...e, kind: 'sick' }]), old, [], now)).toThrow('kind')
    expect(() =>
      validateStatusEpisodes(
        person([{ ...e, transition_history: [{ from: 'active', to: 'resolved', date: '2026-01-01' }] }]),
        old,
        [],
        now,
      ),
    ).toThrow('server')
  })
  test('invalid dates, contradictory outcomes and dual anchors reject', () => {
    for (const fields of [
      { start_date: '2027-01-01' },
      { estimated_end_date: '2020-01-01' },
      { outcome: 'birth' as const },
      { estimated_due_date: '2027-01-01', gestational_age_days: 10, gestational_as_of: '2026-11-11' },
    ]) {
      expect(() =>
        validateStatusEpisodes(person([{ ...episode(), ...fields }]), undefined, [], now),
      ).toThrow()
    }
  })
})
describe('composable status and log conditions', () => {
  test('all eight statuses coexist without gender inference', () => {
    const p = person(peopleStatusDefinitions.map((d) => episode(d.kind)))
    expect(
      statusRuleReasons(
        p,
        guidance({ status_conditions: { all: peopleStatusDefinitions.map((d) => d.kind) } }),
        [],
        now,
      ),
    ).toEqual([])
  })
  test('same episode must meet timing and phase; unknown pregnancy timing fails windows only', () => {
    const first = { ...episode(), phase: 'confirmation' },
      second = { ...episode(), phase: 'birth_preparation', start_date: '2026-11-10' }
    const p = person([first, second])
    expect(
      statusRuleReasons(
        p,
        guidance({
          status_conditions: {
            episode: { kind: 'pregnant', phases: ['birth_preparation'], min_duration_days: 10 },
          },
        }),
        [],
        now,
      ),
    ).not.toEqual([])
    expect(statusRuleReasons(p, guidance({ status_conditions: { all: ['pregnant'] } }), [], now)).toEqual([])
    expect(
      statusRuleReasons(
        p,
        guidance({ status_conditions: { episode: { kind: 'pregnant', min_gestational_days: 1 } } }),
        [],
        now,
      ),
    ).not.toEqual([])
  })
  test('latest explicit refusal suppresses stale request, future logs do not count', () => {
    const e = episode('anxious'),
      p = person([e]),
      g = guidance({
        status_conditions: { all: ['anxious'] },
        log_condition: { care_metric: 'support_need', within_days: 7, state: 'requested' },
      })
    const logs = [
      entry(
        e,
        { care_metric: 'support_need', care_state: 'requested', information_source: 'self_shared' },
        '2026-11-10T00:00:00Z',
      ),
      entry(
        e,
        { care_metric: 'support_need', care_state: 'not_requested', information_source: 'self_shared' },
        '2026-11-11T00:00:00Z',
      ),
      entry(
        e,
        { care_metric: 'support_need', care_state: 'requested', information_source: 'self_shared' },
        '2026-11-13T00:00:00Z',
      ),
    ]
    for (const log of logs) log.person_id = p.id
    expect(statusRuleReasons(p, g, logs, now)).not.toEqual([])
  })
})
describe('private care observations', () => {
  test('consent and source gates new subjective ratings but preserves historical corrections', () => {
    const e = episode('depressed'),
      p = person([e]),
      log = entry(e, { care_metric: 'mood', value: 4, unit: 'rating', information_source: 'self_shared' })
    expect(() => validateCareEvent(log, p, [])).not.toThrow()
    p.status_episodes![0].tracking_agreed = false
    expect(() => validateCareEvent(log, p, [])).toThrow('Agree')
    expect(() => validateCareEvent(log, p, [], log)).not.toThrow()
    expect(() =>
      validateCareEvent({ ...log, payload: { ...log.payload, information_source: 'observed' } }, p, [], log),
    ).toThrow('source')
  })
  test('episode metrics separate repeats, future excluded, retention requires explicit enabled selection', () => {
    const a = episode('depressed'),
      b = episode('depressed'),
      p = person([a, b])
    const logs = [
      entry(a, { care_metric: 'mood', value: 0, unit: 'rating' }),
      entry(b, { care_metric: 'mood', value: 9, unit: 'rating' }, '2027-01-01T00:00:00Z'),
    ]
    expect(careMetrics(p, logs, now).find((m) => m.id === `care:${a.id}:mood:latest`)?.value).toBe(0)
    expect(careMetrics(p, logs, now).find((m) => m.id === `care:${b.id}:mood:latest`)?.value).toBeNull()
    p.status_episodes![0].lifecycle = 'resolved'
    expect(careMetrics(p, logs, now).some((m) => m.status_episode_id === a.id)).toBe(false)
    p.status_episodes![0].retain_metrics = true
    p.enabled_metrics = [`care:${a.id}:mood:latest`]
    expect(careMetrics(p, logs, now).filter((m) => m.status_episode_id === a.id)).toHaveLength(1)
  })
  test('milestone windows are not completions and future observations do not record them', () => {
    const e = episode(),
      p = person([e]),
      defs = [
        {
          id: 'discuss',
          title: 'Discuss',
          description: 'Optional',
          status_kind: 'pregnant' as const,
          evidence_ids: [],
          min_duration_days: 0,
        },
      ]
    expect(careMilestones(p, defs, [], now)[0].state).toBe('available')
    expect(
      careMilestones(
        p,
        defs,
        [entry(e, { milestone_id: 'discuss', observation: 'observed' }, '2027-01-01T00:00:00Z')],
        now,
      )[0].state,
    ).toBe('available')
    expect(
      careMilestones(p, defs, [entry(e, { milestone_id: 'discuss', observation: 'unsure' })], now)[0].state,
    ).toBe('recorded')
  })
})

test('status feedback scopes relevant episodes and safety wins explicit deduplication', () => {
  const pregnancy = episode(),
    illness = { ...episode('sick'), start_date: '2026-11-11' },
    p = person([pregnancy, illness])
  const card = guidance({ id: 'pregnancy', status_conditions: { all: ['pregnant'] }, dedupe_key: 'same' })
  const feedback = [
    {
      guidance_id: card.id,
      version: card.version,
      action: 'dismissed' as const,
      recorded_at: new Date('2026-11-01T00:00:00Z'),
    },
  ]
  expect(matchGuidance(p, peopleContext(p, now), [card], feedback, now)[0].feedback).toBe('dismissed')
  const safe = guidance({ ...card, id: 'safety', guidance_type: 'safety', priority: 1 }),
    routine = guidance({ ...card, id: 'routine', priority: 999 })
  expect(matchGuidance(p, peopleContext(p, now), [routine, safe], [], now).map((g) => g.id)).toEqual([
    'safety',
  ])
  expect(
    evaluatePeopleGuidance(
      p,
      peopleContext(p, now),
      [guidance({ relationship_types: ['friend'] })],
      [],
      now,
    )[0].reasons,
  ).toContain('Relationship type does not match.')
})
test('support log cannot cross episode kinds, people or episode start dates', () => {
  const a = episode('anxious'),
    b = episode('sick'),
    p = person([a, b]),
    g = guidance({
      status_conditions: { all: ['anxious'] },
      log_condition: { care_metric: 'support_need', within_days: 90, state: 'requested' },
    })
  const log = entry(b, {
    care_metric: 'support_need',
    care_state: 'requested',
    information_source: 'self_shared',
  })
  log.person_id = p.id
  expect(statusRuleReasons(p, g, [log], now)).not.toEqual([])
  log.payload.status_episode_id = a.id
  expect(statusRuleReasons(p, g, [log], now)).toEqual([])
  log.person_id = crypto.randomUUID()
  expect(statusRuleReasons(p, g, [log], now)).not.toEqual([])
  log.person_id = p.id
  log.timestamp = '2026-09-30T23:00:00Z'
  expect(statusRuleReasons(p, g, [log], now)).not.toEqual([])
  expect(() => validateCareEvent(log, p, [])).toThrow('predate')
})

test('gestational milestones without an anchor are timing unknown, not dated upcoming', () => {
  const e = episode(),
    p = person([e])
  expect(
    careMilestones(
      p,
      [
        {
          id: 'window',
          title: 'Window',
          description: 'Discuss',
          status_kind: 'pregnant',
          min_gestational_days: 70,
          max_gestational_days: 100,
          evidence_ids: [],
        },
      ],
      [],
      now,
    )[0].state,
  ).toBe('timing_unknown')
})

test('global required kinds compose with a differently typed episode window', () => {
  const pregnancy = { ...episode(), gestational_age_days: 200, gestational_as_of: '2026-11-12' },
    anxiety = episode('anxious'),
    p = person([pregnancy, anxiety]),
    g = guidance({
      status_conditions: { all: ['anxious'], episode: { kind: 'pregnant', min_gestational_days: 196 } },
    })
  expect(statusRuleReasons(p, g, [], now)).toEqual([])
  expect(statusRuleReasons(person([pregnancy]), g, [], now)).not.toEqual([])
})

test('unreferenced episodes and episodes added after a stale edit cannot disappear', () => {
  const original = episode('sick'),
    added = episode('anxious')
  const latest = person([original, added])
  expect(() => validateStatusEpisodes(person([]), person([original]), [], now)).toThrow('Archive')
  expect(() => validateStatusEpisodes(person([original]), latest, [], now)).toThrow('Reload')
  const archived = person([{ ...original, lifecycle: 'archived' }, added])
  expect(() => validateStatusEpisodes(archived, latest, [], now)).not.toThrow()
  expect(archived.status_episodes).toHaveLength(2)
})
