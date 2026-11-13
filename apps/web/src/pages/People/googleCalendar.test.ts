import type { PeopleImportantDateDisplay, Person } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import { peopleGoogleCalendarHref } from './googleCalendar'

const person: Pick<Person, 'id' | 'name' | 'preferred_name'> = {
  id: 'person-private',
  name: 'Full name',
  preferred_name: 'Zoë & 李',
}
const date: PeopleImportantDateDisplay = {
  id: 'date',
  label: 'Birthday & celebration',
  month: 12,
  day: 31,
  year: 1980,
  recurs_annually: true,
  next_occurrence: '2030-12-31',
  days_until: 5,
  anniversary_number: 50,
  source: 'profile',
}

describe('individual Google Calendar copy', () => {
  test('encodes Unicode and an exclusive all-day end across year end', () => {
    const url = new URL(peopleGoogleCalendarHref(person, date, 'https://aurboda.example') ?? '')
    expect(url.origin).toBe('https://calendar.google.com')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Zoë & 李: Birthday & celebration')
    expect(url.searchParams.get('dates')).toBe('20301231/20310101')
    expect(url.searchParams.get('details')).toContain('https://aurboda.example/people?person=person-private')
  })
  test('one-off and annual dates prefill only the selected occurrence for explicit Google review', () => {
    for (const recurs_annually of [false, true]) {
      const url = new URL(
        peopleGoogleCalendarHref(
          person,
          { ...date, recurs_annually } as PeopleImportantDateDisplay,
          'https://aurboda.example',
        ) ?? '',
      )
      expect(url.searchParams.has('recur')).toBe(false)
      expect(url.searchParams.get('details')).toContain('Review the date and any yearly repeat settings')
    }
  })
  test('uses server leap-day occurrence policy rather than inventing recurrence rules', () => {
    const leap = new URL(
      peopleGoogleCalendarHref(
        person,
        { ...date, next_occurrence: '2028-02-29' },
        'https://aurboda.example',
      ) ?? '',
    )
    expect(leap.searchParams.get('dates')).toBe('20280229/20280301')
    const nonLeap = new URL(
      peopleGoogleCalendarHref(
        person,
        { ...date, next_occurrence: '2027-02-28' },
        'https://aurboda.example',
      ) ?? '',
    )
    expect(nonLeap.searchParams.get('dates')).toBe('20270228/20270301')
  })
  test('does not include private notes, gender or original birth year and omits past dates', () => {
    const enrichedPerson = {
      ...person,
      notes: 'PRIVATE_NOTE',
      gender: { identity: 'woman' },
      met: { story: 'PRIVATE_STORY' },
    }
    const enrichedDate = { ...date, notes: 'PRIVATE_DATE_NOTE', ideas: ['PRIVATE_IDEA'] }
    const href = peopleGoogleCalendarHref(enrichedPerson, enrichedDate, 'https://aurboda.example') ?? ''
    expect(decodeURIComponent(href)).not.toMatch(/PRIVATE_|1980|woman/)
    expect(
      peopleGoogleCalendarHref(person, { ...date, next_occurrence: null }, 'https://aurboda.example'),
    ).toBeNull()
  })
})
