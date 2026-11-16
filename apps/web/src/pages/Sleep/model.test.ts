import { describe, expect, it } from 'vitest'

import type { Activity } from '../../state/api'

import {
  activityId,
  checkInText,
  napBody,
  isSleepSession,
  sessionLink,
  sleepDay,
  sleepMinutes,
} from './model'
const session = (fields: Partial<Activity> = {}): Activity => ({
  activity_type: 'sleep',
  source: 'aurboda',
  start_time: new Date('2026-11-15T23:00:00Z'),
  end_time: new Date('2026-11-16T07:00:00Z'),
  ...fields,
})
describe('sleep calculations', () => {
  it('prefers actual asleep time, including zero, to time in bed', () => {
    expect(sleepMinutes(session({ total_sleep: 420, duration: 480 }))).toBe(420)
    expect(sleepMinutes(session({ total_sleep: 0, duration: 480 }))).toBe(0)
    expect(sleepMinutes(session())).toBe(480)
  })
  it('does not count incomplete or invalid sessions as zero', () => {
    expect(sleepMinutes(session({ end_time: undefined }))).toBeNull()
    expect(sleepMinutes(session({ duration: -1 }))).toBeNull()
  })
  it('uses wake-up dates and canonical ids for merged records', () => {
    expect(sleepDay(session()).toISOString()).toBe('2026-11-16T07:00:00.000Z')
    expect(activityId(session({ id: 'merged:abc' }))).toBe('abc')
  })
})
describe('manual naps', () => {
  const now = new Date('2026-11-16T19:00:00Z')
  it('saves the existing nap type with exact historical times', () => {
    expect(napBody('2026-11-15T14:00:00Z', '2026-11-15T14:20:00Z', now)).toEqual({
      activity_type: 'nap',
      title: 'Nap',
      start_time: '2026-11-15T14:00:00.000Z',
      end_time: '2026-11-15T14:20:00.000Z',
    })
  })
  it('rejects missing, reversed, future and implausibly long intervals', () => {
    for (const [start, end] of [
      ['', ''],
      ['2026-11-16T18:00Z', '2026-11-16T17:00Z'],
      ['2026-11-16T18:00Z', '2026-11-17T17:00Z'],
      ['2026-11-13T18:00Z', '2026-11-15T18:00Z'],
    ]) {
      expect(() => napBody(start, end, now)).toThrow()
    }
  })
})
it('keeps check-in answers optional and distinguishes skipped from none', () => {
  expect(checkInText('', 'None', '')).toBe('Sleep check-in\nNight awakenings: None')
  expect(checkInText('Very rested', '', ' Quiet room ')).toBe(
    'Sleep check-in\nFeeling on waking: Very rested\nQuiet room',
  )
  expect(() => checkInText('', '', ' ')).toThrow()
})

it('preserves merged detail links and excludes rest from sleep history', () => {
  expect(sessionLink(session({ id: 'merged:abc' }))).toBe('/detail/activity/merged%3Aabc')
  expect(isSleepSession(session({ activity_type: 'rest' }))).toBe(false)
  expect(isSleepSession(session({ activity_type: 'nap' }))).toBe(true)
})
