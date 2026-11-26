import type { AdhdObservation, AdhdRecord } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import { applicable, arms, coverage, supportIds, itemIds, resumableAttempts } from './model'
const observation = (patch: Partial<AdhdObservation> = {}): AdhdObservation => ({
  id: 'o',
  answer_id: 'a',
  revision: 1,
  observed_at: '2026-11-25T19:00:00Z',
  recorded_at: '2026-11-25T19:01:00Z',
  timezone: 'America/Denver',
  precision: 'minute',
  scope: 'current',
  sampling: 'self_initiated',
  pack: 'core',
  context: {
    target: 'A',
    phase: 'pre_start',
    task_class: 'writing',
    context: 'work',
    main_sleep_confirmed: false,
  },
  expected_instrument_version: 'adhd_custom_v1',
  items: {},
  answers: { energy_now_v1: 1, clarity_now_v1: 5, target_interest_v1: 5, target_start_ease_v1: 1 },
  user_tags: [],
  ...patch,
})
describe('ADHD honest analysis and supports', () => {
  test('same-target pre-start applicability and no-log finite choices', () => {
    const ctx = observation().context
    expect(applicable('target_start_ease_v1', ctx)).toBe(true)
    expect(applicable('target_start_ease_v1', { ...ctx, phase: 'ongoing' })).toBe(false)
    expect(applicable('target_interest_v1', { ...ctx, target: '' })).toBe(false)
    expect(itemIds('tiny_state')).toHaveLength(2)
    expect(itemIds('tiny_task')).toHaveLength(2)
    expect(itemIds('full')).toHaveLength(6)
    for (const barrier of [
      'cannot choose',
      'cannot start',
      'foggy/tired',
      'pressured',
      'distracted',
      'cannot stop',
      'need recovery',
    ]) {
      expect(supportIds(barrier)).toHaveLength(2)
    }
  })
  test('hour claims exclude retrospect/import/date precision and show repeated-day coverage', () => {
    const obs = [
      observation(),
      observation({ id: 'b' }),
      observation({ scope: 'retrospective' }),
      observation({ sampling: 'imported' }),
      observation({ precision: 'date' }),
    ]
    const bins = coverage(obs, 'America/Denver'),
      bin = bins.find((b) => b.n > 0)!
    expect(bin.n).toBe(2)
    expect(bin.days).toBe(1)
    expect(bin.median).toBe(5)
    expect(coverage(obs, 'Asia/Tokyo').find((b) => b.n > 0)?.label).not.toBe(bin.label)
  })
  test.each([
    { values: [1, 5], expected: 3 },
    { values: [5, 2, 1, 4], expected: 3 },
    { values: [5, 1, 2], expected: 2 },
  ])('hour coverage reports the clarity median for $values', ({ values, expected }) => {
    const rows = values.map((value, index) =>
      observation({ id: `clarity-${index}`, answers: { clarity_now_v1: value } }),
    )
    const sampled = coverage(rows, 'UTC').find((bin) => bin.n > 0)!
    expect(sampled.median).toBe(expected)
    expect(sampled.values).toEqual(values)
  })
  test('unsampled hour bins have no clarity median', () => {
    expect(coverage([], 'UTC').every((bin) => bin.median === null)).toBe(true)
  })
  test('pretty arm averages cannot hide missingness, unexposed assignment or method decline', () => {
    const make = (data: AdhdRecord['data']): AdhdRecord => ({
      id: 'r',
      revision: 1,
      kind: 'opportunity',
      created_at: '2026-11-25T19:00:00Z',
      updated_at: '2026-11-25T19:00:00Z',
      data,
    })
    const rows = [
      make({ condition: 'intervention', local_date: '2026-11-25', outcome: { within_five_minutes: 'yes' } }),
      make({ condition: 'intervention', local_date: '2026-11-26' }),
      make({
        condition: 'usual',
        local_date: '2026-11-25',
        declined: true,
        outcome: { within_five_minutes: 'yes', interruption: 'after_start' },
      }),
    ]
    expect(arms(rows)).toMatchObject([
      { assigned: 2, known: 1, missing: 1, starts: 1, exposed: 0, days: 2 },
      { assigned: 1, known: 1, missing: 0, starts: 1, declined: 1, interrupted: 1 },
    ])
  })
})

test('expired or withdrawn pilots never become a return backlog', () => {
  const now = new Date('2026-11-26T19:00:00Z'),
    base = { revision: 1, created_at: now.toISOString(), updated_at: now.toISOString() }
  const state = {
    records: [
      { ...base, id: 'p', kind: 'protocol', data: { status: 'withdrawn', ends_at: '2026-12-01T19:00:00Z' } },
      { ...base, id: 'o', parent_id: 'p', kind: 'opportunity', data: { condition: 'intervention' } },
    ],
  }
  expect(resumableAttempts(state, now)).toHaveLength(0)
  state.records[0].data.status = 'active'
  expect(resumableAttempts(state, now)).toHaveLength(1)
})
