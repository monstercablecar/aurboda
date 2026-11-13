import type {
  Person,
  PeopleImportantDate,
  PeopleCalendarKind,
  PeopleCalendarOccurrence,
} from '@aurboda/api-spec'

export type { PeopleCalendarKind, PeopleCalendarOccurrence } from '@aurboda/api-spec'

export const getDateKind = (entry: Pick<PeopleImportantDate, 'label' | 'kind'>): PeopleCalendarKind => {
  if (entry.kind) return entry.kind
  const label = entry.label.trim().toLowerCase()
  return label === 'birthday' || label === 'anniversary' ? label : 'other'
}

export const celebrationIdeas = (kind: PeopleCalendarKind): string[] => {
  if (kind === 'remembrance') {
    return [
      'Ask whether and how the person would like this date acknowledged; it is fine to leave it quiet.',
      'If welcome, share a memory, write a private note, or spend gentle time together.',
    ]
  }
  const specific = {
    birthday:
      'If welcome, plan something around the person’s interests rather than an assumed birthday tradition.',
    anniversary: 'If both people want to, revisit a shared memory or choose a new experience together.',
    celebration: 'Invite the person to choose a small way to mark what this date means to them.',
    other: 'Ask what this date means and whether the person would like it acknowledged.',
  }
  return [specific[kind], 'Optional ideas: a handwritten note or a shared activity chosen by the person.']
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
const entriesFor = (person: Person): { entry: PeopleImportantDate; source: 'derived' | 'profile' }[] => {
  const saved: PeopleImportantDate[] = person.important_dates ?? []
  const birthday = birthdayEntry(person)
  const duplicate = (entry: PeopleImportantDate) =>
    Boolean(
      birthday &&
      entry.recurs_annually &&
      getDateKind(entry) === 'birthday' &&
      entry.month === birthday.month &&
      entry.day === birthday.day &&
      (entry.year === undefined || entry.year === birthday.year),
    )
  const entries: { entry: PeopleImportantDate; source: 'derived' | 'profile' }[] = saved
    .filter((entry) => !duplicate(entry))
    .map((entry) => ({ entry, source: 'profile' }))
  if (birthday) {
    const notes = saved.find(duplicate)?.notes
    entries.push({ entry: { ...birthday, ...(notes ? { notes } : {}) }, source: 'derived' })
  }
  return entries
}
const datesFor = (
  entry: PeopleImportantDate,
  from: Temporal.PlainDate,
  to: Temporal.PlainDate,
): Temporal.PlainDate[] => {
  const years = entry.recurs_annually
    ? Array.from({ length: to.year - from.year + 1 }, (_, index) => from.year + index)
    : entry.year === undefined
      ? []
      : [entry.year]
  return years
    .filter((year) => entry.year === undefined || year >= entry.year)
    .map((year) =>
      Temporal.PlainDate.from({ year, month: entry.month, day: entry.day }, { overflow: 'constrain' }),
    )
    .filter(
      (date) => Temporal.PlainDate.compare(date, from) >= 0 && Temporal.PlainDate.compare(date, to) <= 0,
    )
}

export const buildPeopleCalendar = (
  people: Person[],
  from: string,
  to: string,
  timezone: string,
): PeopleCalendarOccurrence[] => {
  const first = Temporal.PlainDate.from(from),
    last = Temporal.PlainDate.from(to)
  if (Temporal.PlainDate.compare(first, last) > 0) {
    throw new RangeError('Calendar end must not precede its start.')
  }
  first.toZonedDateTime(timezone)
  return people
    .flatMap((person) =>
      entriesFor(person).flatMap(({ entry, source }) =>
        datesFor(entry, first, last).map((date) => {
          const kind = getDateKind(entry)
          return {
            id: `people:${person.id}:${entry.id}:${date}`,
            person_id: person.id,
            person_name: person.preferred_name || person.name,
            date_id: entry.id,
            label: entry.label,
            date: date.toString(),
            source,
            kind,
            start_time: date.toZonedDateTime(timezone).toInstant().toString(),
            end_time: date.add({ days: 1 }).toZonedDateTime(timezone).toInstant().toString(),
            anniversary_number:
              entry.recurs_annually && entry.year !== undefined ? date.year - entry.year : null,
            ideas: celebrationIdeas(kind),
          }
        }),
      ),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.person_name.localeCompare(b.person_name) ||
        a.id.localeCompare(b.id),
    )
}
