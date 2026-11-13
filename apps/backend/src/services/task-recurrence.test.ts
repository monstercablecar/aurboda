import * as spec from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { nextTaskOccurrence } from './task-recurrence.ts'

describe('task recurrence calendar arithmetic', () => {
  test.each([
    ['2026-12-31', 'daily', '2027-01-01'],
    ['2028-02-28', 'daily', '2028-02-29'],
    ['2028-02-29', 'daily', '2028-03-01'],
    ['2026-03-08', 'daily', '2026-03-09'],
    ['2026-11-01', 'daily', '2026-11-02'],
    ['2026-12-28', 'weekly', '2027-01-04'],
    ['2026-03-05', 'weekly', '2026-03-12'],
    ['2026-01-31', 'monthly', '2026-02-28'],
    ['2028-01-31', 'monthly', '2028-02-29'],
    ['2026-12-31', 'monthly', '2027-01-31'],
    ['0001-01-31', 'monthly', '0001-02-28'],
  ] as const)('%s %s schedules %s', (date, recurrence, expected) => {
    expect(nextTaskOccurrence(date, recurrence).due_date).toBe(expected)
  })
  test('monthly clamp retains original anchor into following months', () => {
    const feb = nextTaskOccurrence('2026-01-31', 'monthly')
    expect(feb).toEqual({ due_date: '2026-02-28', recurrence_anchor_day: 31 })
    expect(nextTaskOccurrence(feb.due_date, 'monthly', feb.recurrence_anchor_day)).toEqual({
      due_date: '2026-03-31',
      recurrence_anchor_day: 31,
    })
    const leapFeb = nextTaskOccurrence('2028-01-31', 'monthly')
    expect(nextTaskOccurrence(leapFeb.due_date, 'monthly', leapFeb.recurrence_anchor_day).due_date).toBe(
      '2028-03-31',
    )
  })
  test.each(['daily', 'weekly', 'monthly'] as const)(
    'rejects %s overflow with a correctable400',
    (recurrence) => {
      expect(() => nextTaskOccurrence('9999-12-31', recurrence)).toThrow('supported calendar range')
      try {
        nextTaskOccurrence('9999-12-31', recurrence)
      } catch (error) {
        expect(error).toMatchObject({ status: 400 })
      }
    },
  )
  test('rejects invalid input dates and year zero', () => {
    expect(() => nextTaskOccurrence('2026-02-30', 'daily')).toThrow('valid calendar')
    expect(() => nextTaskOccurrence('0000-01-01', 'daily')).toThrow('valid calendar')
  })
})

describe('task recurrence contracts', () => {
  test('legacy create and patch do not acquire recurrence defaults', () => {
    expect(spec.createTaskItemBodySchema.parse({ title: 'Old client' })).not.toHaveProperty('recurrence')
    expect(
      spec.updateTaskItemBodySchema.parse({ title: 'Edit', expected_updated_at: '2026-11-12T10:00:00Z' }),
    ).not.toHaveProperty('recurrence')
    expect(
      spec.updateTaskItemBodySchema.parse({ recurrence: null, expected_updated_at: '2026-11-12T10:00:00Z' })
        .recurrence,
    ).toBeNull()
  })
  test('recurring creation requires a date and an open starting state', () => {
    expect(spec.createTaskItemBodySchema.safeParse({ title: 'Repeat', recurrence: 'daily' }).success).toBe(
      false,
    )
    expect(
      spec.createTaskItemBodySchema.safeParse({
        title: 'Repeat',
        recurrence: 'daily',
        due_date: '2026-11-12',
        workflow_status: 'done',
      }).success,
    ).toBe(false)
    expect(
      spec.createTaskItemBodySchema.safeParse({
        title: 'Repeat',
        recurrence: 'daily',
        due_date: '2026-11-12',
        workflow_status: 'in_progress',
      }).success,
    ).toBe(true)
    expect(
      spec.createTaskItemBodySchema.safeParse({
        title: 'Repeat',
        recurrence: 'yearly',
        due_date: '2026-11-12',
      }).success,
    ).toBe(false)
  })
  test('clients cannot overwrite successor markers or internal monthly anchors', () => {
    const body = spec.updateTaskItemBodySchema.parse({
      next_occurrence_id: '11111111-1111-4111-8111-111111111111',
      recurrence_anchor_day: 3,
      expected_updated_at: '2026-11-12T10:00:00Z',
    })
    expect(body).not.toHaveProperty('next_occurrence_id')
    expect(body).not.toHaveProperty('recurrence_anchor_day')
  })
})
