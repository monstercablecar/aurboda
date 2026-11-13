import { describe, expect, test } from 'vitest'

import {
  deterministicAdministrationKey,
  isActualExposureStatus,
  localDateTimeToInstant,
  scheduleAppliesOnDate,
} from './pharmacology.ts'

describe('pharmacology schedule evaluation', () => {
  test.each([
    [{ type: 'daily' as const }, '2026-11-09', true],
    [{ type: 'weekdays' as const, weekdays: [1, 3] }, '2026-11-09', true],
    [{ type: 'weekdays' as const, weekdays: [2] }, '2026-11-09', false],
    [{ type: 'every_n_days' as const, interval_days: 3, anchor_date: '2026-11-01' }, '2026-11-10', true],
    [{ type: 'weekly' as const, weekday: 1 }, '2026-11-09', true],
    [{ type: 'monthly' as const, day_of_month: 9 }, '2026-11-09', true],
    [{ type: 'specific_date' as const, date: '2026-11-09' }, '2026-11-09', true],
    [{ type: 'as_needed' as const }, '2026-11-09', false],
    [{ type: 'none' as const }, '2026-11-09', false],
  ])('evaluates %o on %s', (rule, localDate, expected) => {
    expect(scheduleAppliesOnDate(rule, localDate, 'America/Denver')).toBe(expected)
  })

  test('evaluates interval rules against the local day', () => {
    expect(
      scheduleAppliesOnDate(
        { type: 'interval', interval_hours: 8, anchor_at: '2026-11-08T12:00:00Z' },
        '2026-11-09',
        'America/Denver',
      ),
    ).toBe(true)
  })

  test('respects date bounds', () => {
    expect(scheduleAppliesOnDate({ type: 'daily', start_date: '2026-11-10' }, '2026-11-09')).toBe(false)
    expect(scheduleAppliesOnDate({ type: 'daily', end_date: '2026-11-08' }, '2026-11-09')).toBe(false)
  })

  test('maps local midnight correctly across daylight-saving transitions', () => {
    expect(localDateTimeToInstant('2026-03-08', '00:00:00', 'America/Denver').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    )
    expect(localDateTimeToInstant('2026-03-09', '00:00:00', 'America/Denver').toISOString()).toBe(
      '2026-03-09T06:00:00.000Z',
    )
  })
})

describe('pharmacology event invariants', () => {
  test('only actual administration statuses count as exposure', () => {
    expect(['taken', 'delayed', 'partially_taken'].filter((status) => isActualExposureStatus(status as never))).toEqual([
      'taken',
      'delayed',
      'partially_taken',
    ])
    expect(isActualExposureStatus('skipped')).toBe(false)
    expect(isActualExposureStatus('unknown')).toBe(false)
    expect(isActualExposureStatus('entered_in_error')).toBe(false)
  })

  test('derives deterministic per-item idempotency keys', () => {
    expect(deterministicAdministrationKey('request-1', 'item-2')).toBe('request-1:item-2')
    expect(deterministicAdministrationKey('request-1', 'item-2')).toBe('request-1:item-2')
  })
})
