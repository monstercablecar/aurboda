import type { TreatmentSession } from '@aurboda/api-spec'

import { treatmentCheckinPlanBodySchema } from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { afterQuietHours, checkinWindow, initialReminder } from './treatment-checkin-timing.ts'

const plan = treatmentCheckinPlanBodySchema.parse({ reminders_enabled: true })
const session = {
  planned_at: '2026-11-14T19:00:00Z',
  actual_start: '2026-11-14T19:20:00Z',
  actual_end: '2026-11-14T21:00:00Z',
} as TreatmentSession

describe('honest check-in windows', () => {
  test('anchors follow-ups to actual end, and closes preparation at actual start', () => {
    expect(checkinWindow('before', session).expires?.toISOString()).toBe(
      session.actual_start!.replace('Z', '.000Z'),
    )
    expect(checkinWindow('after', session).due?.toISOString()).toBe('2026-11-14T22:00:00.000Z')
    expect(checkinWindow('next_day', session).due?.toISOString()).toBe('2026-11-15T21:00:00.000Z')
    expect(checkinWindow('custom', session, 72, 12).expires?.toISOString()).toBe('2026-11-18T09:00:00.000Z')
    expect(checkinWindow('after', {} as TreatmentSession)).toEqual({ due: null, expires: null })
  })
  test('four-day-old end time creates no stale reminder burst', () => {
    const window = checkinWindow('next_day', session)
    expect(
      initialReminder(window.due, window.expires, new Date('2026-11-18T21:00:00Z'), 'UTC', plan),
    ).toBeNull()
  })
  test('quiet hours move forward through DST and never outside expiry', () => {
    expect(afterQuietHours(new Date('2026-11-01T06:00:00Z'), 'America/Denver', plan).toISOString()).toBe(
      '2026-11-01T15:00:00.000Z',
    )
    expect(afterQuietHours(new Date('2026-03-08T07:00:00Z'), 'America/Denver', plan).toISOString()).toBe(
      '2026-03-08T14:00:00.000Z',
    )
    const due = new Date('2026-11-18T04:00:00Z')
    expect(initialReminder(due, new Date('2026-11-18T10:00:00Z'), due, 'America/Denver', plan)).toBeNull()
  })
  test('supports daytime quiet windows and equal-time opt-out', () => {
    expect(
      afterQuietHours(new Date('2026-11-18T12:00:00Z'), 'UTC', {
        quiet_start: '10:00',
        quiet_end: '14:00',
      }).toISOString(),
    ).toBe('2026-11-18T14:00:00.000Z')
    const at = new Date('2026-11-18T12:00:00Z')
    expect(afterQuietHours(at, 'UTC', { quiet_start: '12:00', quiet_end: '12:00' })).toEqual(at)
  })
})
