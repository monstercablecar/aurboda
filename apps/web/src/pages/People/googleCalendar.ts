import type { PeopleImportantDateDisplay, Person } from '@aurboda/api-spec'

export const peopleGoogleCalendarHref = (
  person: Pick<Person, 'id' | 'name' | 'preferred_name'>,
  date: Pick<PeopleImportantDateDisplay, 'label' | 'next_occurrence'>,
  origin: string,
): string | null => {
  if (!date.next_occurrence) return null
  const nextDay = new Date(`${date.next_occurrence}T00:00:00.000Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const end = nextDay.toISOString().slice(0, 10).replaceAll('-', '')
  const profile = new URL('/people', origin)
  profile.searchParams.set('person', person.id)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${person.preferred_name || person.name}: ${date.label}`,
    dates: `${date.next_occurrence.replaceAll('-', '')}/${end}`,
    details: `Added from Aurboda People. Review the date and any yearly repeat settings before saving.\n\n${profile.href}`,
  })
  return `https://calendar.google.com/calendar/r/eventedit?${params}`
}
