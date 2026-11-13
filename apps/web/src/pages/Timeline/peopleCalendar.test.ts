import type { PeopleCalendarOccurrence } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import { buildCategoryMatchers } from './legendCategories'
import {
  buildPeopleCalendarItems,
  peopleCalendarQueryKey,
  peopleCalendarRangeError,
  peopleCalendarWindow,
  peopleDateTimelineHref,
} from './peopleCalendar'
import { buildTooltipHtml } from './tooltipBuilder'

const occurrence: PeopleCalendarOccurrence = {
  id: 'date-occurrence',
  person_id: 'person / private',
  person_name: 'A <friend>',
  date_id: 'birthday',
  label: 'Birthday',
  date: '2030-02-28',
  start_time: '2030-02-28T07:00:00.000Z',
  end_time: '2030-03-01T07:00:00.000Z',
  source: 'profile',
  kind: 'birthday',
  anniversary_number: null,
  ideas: ['Ask what they would enjoy.'],
}

describe('People calendar presentation', () => {
  test('uses server all-day boundaries, Calendar legend, private profile link and plain date tooltip', () => {
    const [item] = buildPeopleCalendarItems([occurrence])
    expect(item.start.toISOString()).toBe(occurrence.start_time)
    expect(item.end.toISOString()).toBe(occurrence.end_time)
    expect(item.isPoint).toBe(false)
    expect(item.label).toBe('A <friend>: Birthday')
    expect(item.href).toBe('/people?person=person%20%2F%20private')
    expect(item.entity_id).toBeUndefined()
    expect(item.entity_type).toBeUndefined()
    const matchers = buildCategoryMatchers(new Map(), [])
    expect(matchers.calendar(item)).toBe(true)
    expect(matchers.activity(item)).toBe(true)
    const tooltip = buildTooltipHtml(item, [], [])
    expect(tooltip).toContain('2030-02-28 · All day')
    expect(tooltip).toContain('A &lt;friend&gt;')
    expect(tooltip).toContain('Ask what they would enjoy.')
  })
  test('calendar query identity separates users, sessions and ranges', () => {
    const key = peopleCalendarQueryKey('one', 'token1', '2030-01-01', '2030-01-31')
    expect(key).not.toEqual(peopleCalendarQueryKey('two', 'token2', '2030-01-01', '2030-01-31'))
    expect(key).not.toEqual(peopleCalendarQueryKey('one', 'token3', '2030-01-01', '2030-01-31'))
    expect(key).not.toEqual(peopleCalendarQueryKey('one', 'token1', '2030-02-01', '2030-02-28'))
  })
  test('view range includes adjacent account-timezone dates and rejects overly wide or reversed ranges', () => {
    expect(peopleCalendarWindow(new Date('2030-03-01T00:00:00Z'), new Date('2030-03-01T23:59:59Z'))).toEqual({
      from: '2030-02-28',
      to: '2030-03-02',
    })
    expect(peopleCalendarRangeError('2030-01-01', '2041-01-01')).toContain('3,660')
    expect(peopleCalendarRangeError('2030-02-01', '2030-01-01')).toContain('valid date range')
    expect(peopleCalendarRangeError('2030-01-01', '2030-01-31')).toBeNull()
  })
  test('date-only link uses the established Timeline hash without changing the calendar date', () => {
    const href = peopleDateTimelineHref('2030-02-28')
    const params = new URLSearchParams(href.split('#')[1])
    expect(params.get('from')).toBe('2030-02-28T00:00:00.000Z')
    expect(params.get('to')).toBe('2030-03-01T00:00:00.000Z')
  })
})
