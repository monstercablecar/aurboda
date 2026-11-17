import type { AddReminderBody, Reminder } from '@aurboda/api-spec'

import { describe, expect, it } from 'vitest'

import { localReminderDate, reminderCalendarLink, reminderFormError } from './custom-reminders'

const form: AddReminderBody = {
  title: 'Evening check-in',
  time_of_day: '20:00',
  timezone: 'America/Denver',
  start_date: '2026-11-18',
  recurrence: 'daily',
  enabled: true,
  link: '/journal',
}
const reminder: Reminder = {
  ...form,
  id: 'test',
  next_due_at: '2026-11-19T03:00:00Z',
  created_at: '2026-11-17T20:00:00Z',
  updated_at: '2026-11-17T20:00:00Z',
}

describe('custom reminder calendar copy', () => {
  it('copies exactly five minutes of the next occurrence, without creating a recurring calendar series', () => {
    const url = new URL(reminderCalendarLink(reminder, 'https://example.com')!)
    expect(url.origin).toBe('https://calendar.google.com')
    expect(url.searchParams.get('dates')).toBe('20261119T030000Z/20261119T030500Z')
    expect(url.searchParams.get('text')).toBe(form.title)
    expect(url.searchParams.get('location')).toBe('https://example.com/journal')
    expect(url.searchParams.has('recur')).toBe(false)
    expect(url.searchParams.get('details')).toContain('do not update')
  })
  it('does not invent an event for finished or paused reminders, or copy an external destination', () => {
    expect(reminderCalendarLink({ ...reminder, next_due_at: null }, 'https://example.com')).toBeNull()
    const url = new URL(
      reminderCalendarLink({ ...reminder, link: '//evil.example/steal' }, 'https://example.com')!,
    )
    expect(url.searchParams.has('location')).toBe(false)
  })
})
it('uses the chosen zone for the default date, including around UTC midnight', () => {
  expect(localReminderDate('America/Denver', new Date('2026-11-18T01:00:00Z'))).toBe('2026-11-17')
})
it('validates the form without sending external or malformed paths', () => {
  expect(reminderFormError(form)).toBeNull()
  for (const link of ['https://evil.example', '//evil.example', '/\\evil.example', '/journal\n']) {
    expect(reminderFormError({ ...form, link })).not.toBeNull()
  }
  expect(reminderFormError({ ...form, timezone: 'Wrong/Zone' })).toContain('time zone')
  expect(reminderFormError({ ...form, time_of_day: '25:00' })).toContain('time')
  expect(reminderFormError({ ...form, title: ' ' })).toContain('name')
})
