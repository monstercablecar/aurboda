import type { PeopleCalendarOccurrence } from '@aurboda/api-spec'

import type { ChartItem } from './types'

import { tagSourceColors } from './colors'
import { timelineHref } from './viewHash'

export const peopleCalendarWindow = (start: Date, end: Date) => ({
  from: new Date(start.getTime() - 86_400_000).toISOString().slice(0, 10),
  to: new Date(end.getTime() + 86_400_000).toISOString().slice(0, 10),
})

export const peopleCalendarRangeError = (from: string, to: string): string | null => {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  if (!Number.isFinite(days) || days < 1) return 'Choose a valid date range for People calendar dates.'
  if (days > 3660) return 'Choose a range of at most 3,660 days to see People calendar dates.'
  return null
}

export const peopleCalendarQueryKey = (
  user: string | undefined,
  token: string | undefined,
  from: string,
  to: string,
) => ['people-calendar', user, token, from, to] as const

export const peopleDateTimelineHref = (date: string) => timelineHref(new Date(`${date}T12:00:00.000Z`))

export const buildPeopleCalendarItems = (dates: PeopleCalendarOccurrence[]): ChartItem[] =>
  dates.map((date) => {
    const label = `${date.person_name}: ${date.label}`
    return {
      column: 'Activity',
      color: tagSourceColors.calendar,
      start: new Date(date.start_time),
      end: new Date(date.end_time),
      label,
      isPoint: false,
      href: `/people?person=${encodeURIComponent(date.person_id)}`,
      tooltip: { title: label, date: date.date, time: 'All day', details: date.ideas },
    }
  })
