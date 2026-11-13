import type { PeopleImportantDate } from '@aurboda/api-spec'

import {
  personSchema,
  peopleImportantDateSchema,
  createPersonBodySchema,
  updatePersonBodySchema,
  updatePeopleEventBodySchema,
  peopleImportantDateDisplaySchema,
} from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { personImportantDates } from './people-dates.ts'
const profile = () =>
  personSchema.parse({
    id: '898010ca-6611-499f-937b-90e9ee76d933',
    name: 'A',
    relationship: 'friend',
    date_of_birth: '1990-04-20',
    needs: ['maintain_friendship'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
const entry = (changes: Partial<PeopleImportantDate> = {}): PeopleImportantDate => ({
  id: '8ee5b1be-fe3a-40fb-8b79-c70a0422ca38',
  label: 'Anniversary',
  month: 2,
  day: 29,
  recurs_annually: true,
  ...changes,
})
describe('People important dates and optional profile fields', () => {
  test.each([
    { month: 4, day: 31 },
    { month: 2, day: 30 },
    { month: 2, day: 29, year: 2023 },
    { month: 13 },
    { day: 0 },
    { year: 0 },
    { recurs_annually: false },
  ])('rejects invalid calendar date %j', (changes) =>
    expect(peopleImportantDateSchema.safeParse(entry(changes)).success).toBe(false),
  )
  test('accepts leap day without a birth year and preserves exact date', () => {
    expect(peopleImportantDateSchema.safeParse(entry()).success).toBe(true)
    const p = { ...profile(), important_dates: [entry()] }
    const date = personImportantDates(p, new Date('2027-02-27T22:00:00Z'))[0]
    expect(date).toMatchObject({
      month: 2,
      day: 29,
      next_occurrence: '2027-02-28',
      days_until: 1,
      anniversary_number: null,
    })
    expect(peopleImportantDateDisplaySchema.safeParse(date).success).toBe(true)
  })
  test('after nonleap anniversary next occurrence is Feb29 in leap year', () => {
    const p = { ...profile(), date_of_birth: null, important_dates: [entry({ year: 2020 })] }
    expect(personImportantDates(p, new Date('2027-03-01T00:00:00Z'))[0]).toMatchObject({
      next_occurrence: '2028-02-29',
      anniversary_number: 8,
    })
  })
  test('today and year boundary ordering uses UTC dates without timezone drift', () => {
    const p = {
      ...profile(),
      date_of_birth: null,
      important_dates: [
        entry({ month: 1, day: 1 }),
        entry({ id: '3e4a9a79-4ef6-48b2-ab4b-6ef8d15aa58c', month: 12, day: 31 }),
      ],
    }
    const dates = personImportantDates(p, new Date('2026-12-30T23:30:00-01:00'))
    expect(dates.map((d) => [d.next_occurrence, d.days_until])).toEqual([
      ['2026-12-31', 0],
      ['2027-01-01', 1],
    ])
  })
  test('past one-time dates remain history, no upcoming occurrence or invented anniversary', () => {
    const p = {
      ...profile(),
      important_dates: [entry({ month: 5, day: 1, year: 2020, recurs_annually: false })],
    }
    const dates = personImportantDates(p, new Date('2026-01-01T00:00:00Z'))
    expect(dates.at(-1)).toMatchObject({
      source: 'profile',
      next_occurrence: null,
      days_until: null,
      anniversary_number: null,
    })
    expect(dates[0]).toMatchObject({
      source: 'derived',
      label: 'Birthday',
      next_occurrence: '2026-04-20',
      anniversary_number: 36,
    })
  })
  test('derived birthday merges a matching saved birthday without losing its note', () => {
    const p = {
      ...profile(),
      important_dates: [entry({ label: 'birthday', month: 4, day: 20, notes: 'Favorite cake' })],
    }
    const dates = personImportantDates(p, new Date('2026-01-01T00:00:00Z'))
    expect(dates).toHaveLength(1)
    expect(dates[0]).toMatchObject({
      id: `birthday:${p.id}`,
      source: 'derived',
      notes: 'Favorite cake',
      year: 1990,
    })
  })
  test('duplicate IDs rejected and optional fields have no patch defaults', () => {
    const p = profile()
    expect(createPersonBodySchema.safeParse({ ...p, important_dates: [entry(), entry()] }).success).toBe(
      false,
    )
    expect(updatePersonBodySchema.parse({})).toEqual({})
    expect(updatePeopleEventBodySchema.parse({})).toEqual({})
    expect(updatePersonBodySchema.parse({ gender: null, met: null, important_dates: [] })).toEqual({
      gender: null,
      met: null,
      important_dates: [],
    })
  })
  test('old profiles work without added fields, approximate ages never invent birthday', () => {
    const p = {
      ...profile(),
      date_of_birth: null,
      approximate_age: { value: 35, unit: 'years' as const, as_of: '2026-01-01' },
    }
    expect(personImportantDates(p)).toEqual([])
    expect(createPersonBodySchema.safeParse(p).success).toBe(true)
  })
})

test('Denver birthdays remain today after the UTC date has advanced', () => {
  const p = { ...profile(), date_of_birth: '1990-11-11' }
  const now = new Date('2026-11-12T01:30:00Z')
  expect(personImportantDates(p, now, 'America/Denver')[0]).toMatchObject({
    next_occurrence: '2026-11-11',
    days_until: 0,
    anniversary_number: 36,
  })
  expect(personImportantDates(p, now, 'UTC')[0].next_occurrence).toBe('2027-11-11')
})
test('calendar day countdown stays one day across DST, not elapsed hours', () => {
  const p = { ...profile(), date_of_birth: null, important_dates: [entry({ month: 3, day: 9 })] }
  expect(personImportantDates(p, new Date('2026-03-08T07:00:00Z'), 'America/Denver')[0]).toMatchObject({
    next_occurrence: '2026-03-09',
    days_until: 1,
  })
  expect(personImportantDates(p, new Date('2026-03-09T06:00:00Z'), 'America/Denver')[0].days_until).toBe(0)
})

test('explicit date kind overrides a birthday label for dashboard deduplication', () => {
  const p = {
    ...profile(),
    important_dates: [entry({ label: 'Birthday', kind: 'remembrance', month: 4, day: 20 })],
  }
  const dates = personImportantDates(p, new Date('2026-01-01T00:00:00Z'))
  expect(dates).toHaveLength(2)
  expect(dates.find((date) => date.source === 'profile')?.kind).toBe('remembrance')
  const merged = personImportantDates(
    {
      ...p,
      important_dates: [
        entry({ label: 'A special day', kind: 'birthday', month: 4, day: 20, notes: 'Keep this note' }),
      ],
    },
    new Date('2026-01-01T00:00:00Z'),
  )
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({ source: 'derived', kind: 'birthday', notes: 'Keep this note' })
})
