import type { PeopleDashboard, PeopleOptions, Person } from '@aurboda/api-spec'

import { peopleDateTimelineHref } from '../Timeline/peopleCalendar'
import { peopleGoogleCalendarHref } from './googleCalendar'
import { compactMet } from './ProfileDetailsForm'

function IdentityDetails({
  gender,
  options,
}: {
  gender: NonNullable<Person['gender']>
  options: PeopleOptions
}) {
  return (
    <section>
      <h3>Identity</h3>
      <p>{options.genders?.find((option) => option.value === gender.identity)?.label ?? gender.identity}</p>
      {gender.description && <p>{gender.description}</p>}
      {gender.pronouns && <p>Pronouns: {gender.pronouns}</p>}
    </section>
  )
}

export function ProfileDetails({
  dashboard,
  options,
}: {
  dashboard: PeopleDashboard
  options: PeopleOptions
}) {
  const { person } = dashboard
  const dates = dashboard.important_dates ?? []
  const met = compactMet(person.met)
  if (!person.gender && !met && !person.notes && !dates.length) return null
  return (
    <details class="people-panel">
      <summary>Personal details and important dates</summary>
      {person.gender && <IdentityDetails gender={person.gender} options={options} />}
      {met && (
        <section>
          <h3>How we met</h3>
          {met.place && <p>{met.place}</p>}
          {met.date && (
            <p>
              Date: <time dateTime={met.date}>{met.date}</time>
            </p>
          )}
          {met.story && <p class="people-preserve-lines">{met.story}</p>}
        </section>
      )}
      {person.notes && (
        <section>
          <h3>Profile notes</h3>
          <p class="people-preserve-lines">{person.notes}</p>
        </section>
      )}
      {dates.length > 0 && (
        <section>
          <h3>Important dates</h3>
          <ul class="people-history">
            {dates.map((date) => (
              <li key={date.id}>
                <strong>{date.label}</strong>
                <p>
                  Recorded date: {date.year ? `${String(date.year).padStart(4, '0')}-` : ''}
                  {String(date.month).padStart(2, '0')}-{String(date.day).padStart(2, '0')}
                  {date.year ? '' : ' (year not recorded)'}
                </p>
                {date.next_occurrence ? (
                  <p>
                    Next occurrence: <time dateTime={date.next_occurrence}>{date.next_occurrence}</time>
                    {date.days_until !== null && ` · ${date.days_until} days away`}
                  </p>
                ) : (
                  <p class="people-muted">No upcoming occurrence.</p>
                )}
                {date.recurs_annually && date.anniversary_number !== null && date.anniversary_number > 0 && (
                  <p>At next occurrence: {date.anniversary_number} years</p>
                )}
                {date.next_occurrence && (
                  <div class="people-actions people-calendar-actions">
                    <a href={peopleDateTimelineHref(date.next_occurrence)}>View in timeline</a>
                    <a
                      href={peopleGoogleCalendarHref(person, date, window.location.origin) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Add to Google Calendar
                    </a>
                  </div>
                )}
                {(date.ideas ?? []).length > 0 && (
                  <details>
                    <summary>Ideas for this date</summary>
                    <ul>
                      {date.ideas?.map((idea) => (
                        <li key={idea}>{idea}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {date.notes && <p class="people-preserve-lines">{date.notes}</p>}
                {date.source === 'derived' && <p class="people-muted">From the recorded date of birth.</p>}
              </li>
            ))}
          </ul>
          <p class="people-muted">
            Edit the profile to change dates. Date reminders are not scheduled automatically.
          </p>
          <p class="people-muted">
            Google Calendar buttons prefill one occurrence for you to review and save. Review and set any
            yearly repeat in Google Calendar. Changes here won't update the Google copy.
          </p>
        </section>
      )}
    </details>
  )
}
