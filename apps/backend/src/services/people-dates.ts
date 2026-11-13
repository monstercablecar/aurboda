import type { Person, PeopleImportantDate, PeopleImportantDateDisplay } from '@aurboda/api-spec'

import { getDateKind } from './people-calendar.ts'

/** All-day dates use the user’s calendar timezone (UTC fallback). Feb 29 anniversaries fall on Feb 28 in non-leap years. */
const occurrence = (entry: PeopleImportantDate, year: number) =>
  Temporal.PlainDate.from({ year, month: entry.month, day: entry.day }, { overflow: 'constrain' })
const displayDate = (
  entry: PeopleImportantDate,
  today: Temporal.PlainDate,
  source: 'derived' | 'profile',
): PeopleImportantDateDisplay => {
  let next: Temporal.PlainDate | null
  if (entry.recurs_annually) {
    next = occurrence(entry, Math.max(today.year, entry.year ?? today.year))
    if (Temporal.PlainDate.compare(next, today) < 0) next = occurrence(entry, next.year + 1)
  } else {
    next = occurrence(entry, entry.year!)
    if (Temporal.PlainDate.compare(next, today) < 0) next = null
  }
  return {
    ...entry,
    source,
    next_occurrence: next?.toString() ?? null,
    days_until: next ? today.until(next, { largestUnit: 'days' }).days : null,
    anniversary_number:
      next && entry.recurs_annually && entry.year !== undefined ? next.year - entry.year : null,
  }
}
const birthdayEntry = (person: Person): PeopleImportantDate | null => {
  if (!person.date_of_birth) return null
  const birth = Temporal.PlainDate.from(person.date_of_birth)
  return {
    id: `birthday:${person.id}`,
    label: 'Birthday',
    kind: 'birthday',
    month: birth.month,
    day: birth.day,
    year: birth.year,
    recurs_annually: true,
  }
}
const duplicatesBirthday = (entry: PeopleImportantDate, birthday: PeopleImportantDate) =>
  entry.recurs_annually &&
  getDateKind(entry) === 'birthday' &&
  entry.month === birthday.month &&
  entry.day === birthday.day &&
  (entry.year === undefined || entry.year === birthday.year)
/** Past one-off entries have no upcoming occurrence. A matching saved birthday enriches the derived card. */
export const personImportantDates = (
  person: Person,
  now = new Date(),
  timezone = 'UTC',
): PeopleImportantDateDisplay[] => {
  const today = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone).toPlainDate()
  const saved = person.important_dates ?? []
  const birthday = birthdayEntry(person)
  const entries = saved
    .filter((entry) => !birthday || !duplicatesBirthday(entry, birthday))
    .map((entry) => displayDate(entry, today, 'profile'))
  if (birthday) {
    const savedBirthday = saved.find((entry) => duplicatesBirthday(entry, birthday))
    entries.push(
      displayDate(
        { ...birthday, ...(savedBirthday?.notes ? { notes: savedBirthday.notes } : {}) },
        today,
        'derived',
      ),
    )
  }
  return entries.sort(
    (a, b) =>
      (a.days_until ?? Infinity) - (b.days_until ?? Infinity) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  )
}
