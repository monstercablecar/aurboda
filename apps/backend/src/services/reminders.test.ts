import type { AddReminderBody } from '@aurboda/api-spec'

import { addReminderBodySchema } from '@aurboda/api-spec'
import { describe, expect, test, vi } from 'vitest'

import { isToolAllowedWhenReadOnly } from '../mcp/read-only-gate.ts'
import { nextReminderOccurrence, runReminderTick } from './reminders.ts'

const base: AddReminderBody = {
  title: 'Evening check-in',
  time_of_day: '20:00',
  timezone: 'America/Denver',
  recurrence: 'daily',
  start_date: '2026-11-17',
  enabled: true,
  link: null,
}
const next = (patch: Partial<AddReminderBody>, after: string) =>
  nextReminderOccurrence({ ...base, ...patch }, new Date(after))?.toISOString() ?? null

describe('custom reminder scheduling', () => {
  test('uses local time, skips past time on create, and does not fire at exact creation time', () => {
    expect(next({}, '2026-11-17T22:00:00Z')).toBe('2026-11-18T03:00:00.000Z')
    expect(next({}, '2026-11-18T03:00:00Z')).toBe('2026-11-19T03:00:00.000Z')
  })
  test('one-time reminders expire and disabled reminders have no next occurrence', () => {
    expect(next({ recurrence: 'once' }, '2026-11-18T04:00:00Z')).toBeNull()
    expect(next({ enabled: false }, '2026-11-17T22:00:00Z')).toBeNull()
  })
  test('honors future start date, weekdays and weekly anchor', () => {
    expect(next({ start_date: '2026-12-01' }, '2026-11-17T22:00:00Z')).toBe('2026-12-02T03:00:00.000Z')
    expect(next({ recurrence: 'weekdays' }, '2026-11-21T04:00:00Z')).toBe('2026-11-24T03:00:00.000Z')
    expect(next({ recurrence: 'weekly' }, '2026-11-18T04:00:00Z')).toBe('2026-11-25T03:00:00.000Z')
  })
  test('spring gap shifts forward and fall overlap fires only first wall-clock occurrence', () => {
    expect(next({ start_date: '2026-03-08', time_of_day: '02:30' }, '2026-03-08T06:00:00Z')).toBe(
      '2026-03-08T09:30:00.000Z',
    )
    expect(next({ start_date: '2026-11-01', time_of_day: '01:30' }, '2026-11-01T06:00:00Z')).toBe(
      '2026-11-01T07:30:00.000Z',
    )
    expect(next({ start_date: '2026-11-01', time_of_day: '01:30' }, '2026-11-01T07:31:00Z')).toBe(
      '2026-11-02T08:30:00.000Z',
    )
  })
  test('validates dates, zones and local paths at the shared boundary', () => {
    for (const patch of [
      { start_date: '2026-02-30' },
      { timezone: 'not-a-zone' },
      { link: '//evil.example' },
      { link: '/\\evil.example' },
      { link: '/a\nb' },
      { time_of_day: '25:00' },
      { title: '   ' },
    ]) {
      expect(addReminderBodySchema.safeParse({ ...base, ...patch }).success).toBe(false)
    }
    expect(addReminderBodySchema.safeParse({ ...base, link: '/check-ins/example?embed=1' }).success).toBe(
      true,
    )
  })
  test('one failing account does not block others and is retried next tick', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deliver = vi.fn().mockRejectedValueOnce(new Error('database down')).mockResolvedValue(1)
    await runReminderTick(async () => ['a', 'b'], deliver)
    await runReminderTick(async () => ['a', 'b'], deliver)
    expect(deliver.mock.calls.map(([user]) => user)).toEqual(['a', 'b', 'a', 'b'])
    expect(warn).toHaveBeenCalledWith('Custom reminder delivery failed; next tick will retry.')
    warn.mockRestore()
  })
  test('read-only MCP cannot create, modify, delete or test reminders', () => {
    for (const name of ['add_reminder', 'update_reminder', 'delete_reminder', 'test_reminder_notification']) {
      expect(isToolAllowedWhenReadOnly(name)).toBe(false)
    }
    expect(isToolAllowedWhenReadOnly('list_reminders')).toBe(true)
  })
})
