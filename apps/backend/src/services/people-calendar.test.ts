import type { Person, PeopleImportantDate } from '@aurboda/api-spec'

import { describe, expect, it } from 'vitest'

import {
  buildPeopleCalendar,
  celebrationIdeas,
  getDateKind,
  type PeopleCalendarKind,
} from './people-calendar.ts'

const entry = (
  overrides: Partial<PeopleImportantDate & { kind: PeopleCalendarKind }> = {},
): PeopleImportantDate & { kind?: PeopleCalendarKind } => ({
  id: 'e84f4bd2-55f3-45e2-a542-9b84cb9ee991',
  label: 'A meaningful day',
  month: 12,
  day: 31,
  recurs_annually: true,
  ...overrides,
})
const person = (dates: PeopleImportantDate[] = [], overrides: Partial<Person> = {}): Person => ({
  id: 'b9fb49e4-4611-45bc-ac62-3509a3b11cc7',
  name: 'Someone',
  relationship: 'friend',
  needs: ['maintain_friendship'],
  approximate_age: { value: 35, unit: 'years', as_of: '2026-11-11' },
  corrected_age_weeks: 0,
  statuses: [],
  goals: [],
  interests: [],
  notes: '',
  enabled_metrics: [],
  hidden_modules: [],
  created_at: '2026-11-11T00:00:00Z',
  updated_at: '2026-11-11T00:00:00Z',
  important_dates: dates,
  ...overrides,
})

describe('private People calendar occurrences', () => {
  it('starts empty and includes both range boundaries across a year change', () => {
    expect(buildPeopleCalendar([], '2026-12-31', '2027-01-01', 'UTC')).toEqual([])
    const p = person([entry(), entry({ id: '9b187c07-2ea5-4ce5-8432-b57528b4e027', month: 1, day: 1 })])
    expect(buildPeopleCalendar([p], '2026-12-31', '2027-01-01', 'UTC').map((o) => o.date)).toEqual([
      '2026-12-31',
      '2027-01-01',
    ])
  })
  it('expands each year, keeps unknown anniversaries unknown, and excludes years before the actual date', () => {
    const p = person([entry({ year: 2025, label: 'Anniversary' })])
    expect(
      buildPeopleCalendar([p], '2024-01-01', '2027-12-31', 'UTC').map((o) => [o.date, o.anniversary_number]),
    ).toEqual([
      ['2025-12-31', 0],
      ['2026-12-31', 1],
      ['2027-12-31', 2],
    ])
    expect(
      buildPeopleCalendar([person([entry()])], '2026-01-01', '2027-12-31', 'UTC').every(
        (o) => o.anniversary_number === null,
      ),
    ).toBe(true)
  })
  it('uses Feb 28 in nonleap years without changing the saved Feb 29 date', () => {
    const p = person([entry({ month: 2, day: 29, year: 2020 })])
    expect(buildPeopleCalendar([p], '2023-01-01', '2025-12-31', 'UTC').map((o) => o.date)).toEqual([
      '2023-02-28',
      '2024-02-29',
      '2025-02-28',
    ])
    expect(p.important_dates?.[0].day).toBe(29)
  })
  it('uses local midnight and an exclusive next-day boundary through daylight saving changes', () => {
    const spring = buildPeopleCalendar(
      [person([entry({ month: 3, day: 8 })])],
      '2026-03-08',
      '2026-03-08',
      'America/Denver',
    )[0]
    expect(spring.start_time).toBe('2026-03-08T07:00:00Z')
    expect(spring.end_time).toBe('2026-03-09T06:00:00Z')
    expect(Date.parse(spring.end_time) - Date.parse(spring.start_time)).toBe(23 * 3600000)
    const fall = buildPeopleCalendar(
      [person([entry({ month: 11, day: 1 })])],
      '2026-11-01',
      '2026-11-01',
      'America/Denver',
    )[0]
    expect(Date.parse(fall.end_time) - Date.parse(fall.start_time)).toBe(25 * 3600000)
  })
  it('shows once-only dates only in their actual year', () => {
    const p = person([entry({ year: 2026, recurs_annually: false, kind: 'celebration' })])
    const result = buildPeopleCalendar([p], '2025-01-01', '2028-12-31', 'UTC')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      date: '2026-12-31',
      anniversary_number: null,
      kind: 'celebration',
      source: 'profile',
    })
  })
  it('deduplicates DOB birthdays while respecting an explicit remembrance kind', () => {
    const p = person(
      [
        entry({ label: ' Birthday ', month: 2, day: 29, notes: 'A quiet day' }),
        entry({
          id: 'da83bad9-c0b7-4681-9bad-831c8cb0ab1b',
          label: 'Birthday',
          kind: 'remembrance',
          month: 2,
          day: 29,
        }),
      ],
      { date_of_birth: '2000-02-29', approximate_age: null },
    )
    const result = buildPeopleCalendar([p], '2027-02-28', '2027-02-28', 'UTC')
    expect(result).toHaveLength(2)
    expect(result.find((o) => o.source === 'derived')).toMatchObject({
      kind: 'birthday',
      date_id: `birthday:${p.id}`,
      anniversary_number: 27,
    })
    expect(result.find((o) => o.kind === 'remembrance')?.source).toBe('profile')
  })
  it('keeps IDs stable across query ranges, renames and timezone presentation', () => {
    const p = person([entry()])
    const one = buildPeopleCalendar([p], '2026-12-31', '2026-12-31', 'UTC')[0]
    const two = buildPeopleCalendar(
      [{ ...p, name: 'New name' }],
      '2026-01-01',
      '2027-12-31',
      'America/Denver',
    )[0]
    expect(one.id).toBe(two.id)
    expect(one.person_id).toBe(p.id)
    expect(two.person_name).toBe('New name')
    const preferred = buildPeopleCalendar(
      [{ ...p, preferred_name: 'Preferred name' }],
      '2026-12-31',
      '2026-12-31',
      'UTC',
    )[0]
    expect(preferred.person_name).toBe('Preferred name')
    expect(preferred.id).toBe(one.id)
  })
  it('uses exact legacy labels only and never guesses from sensitive text', () => {
    expect(getDateKind({ label: ' Anniversary ' })).toBe('anniversary')
    expect(getDateKind({ label: 'Birthday', kind: 'other' })).toBe('other')
    expect(getDateKind({ label: 'Death anniversary' })).toBe('other')
    expect(getDateKind({ label: 'Wedding anniversary' })).toBe('other')
    const ideas = celebrationIdeas('remembrance').join(' ')
    expect(ideas).toContain('leave it quiet')
    expect(ideas).not.toMatch(/happy|celebrat/i)
    expect(celebrationIdeas('birthday').join(' ')).toContain('interests')
  })
  it('rejects inverted ranges and invalid zones even with no people', () => {
    expect(() => buildPeopleCalendar([], '2027-01-01', '2026-01-01', 'UTC')).toThrow(RangeError)
    expect(() => buildPeopleCalendar([], '2026-01-01', '2026-01-02', 'not/a-zone')).toThrow(RangeError)
  })
})
