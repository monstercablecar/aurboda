import type { AddReminderBody, Reminder, RemindersResponse } from '@aurboda/api-spec'

import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { createRemindersClient } from '../state/api/reminders'
import { fetchUserSettings } from '../state/api/settings'
import { currentSessionGeneration } from '../state/sessionBoundary'
import {
  localReminderDate,
  reminderCalendarLink,
  reminderFormError,
  reminderRepeatLabels,
} from './custom-reminders'
import { SettingsSection } from './SettingsSection'
import './CustomRemindersSettings.css'

const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) return error.response?.data?.error ?? 'Could not save. Please try again.'
  return error instanceof Error ? error.message : 'Could not save. Please try again.'
}

export function CustomRemindersSettings() {
  const generation = currentSessionGeneration()
  const api = useMemo(() => createRemindersClient(), [generation])
  const client = useQueryClient()
  const key = ['custom-reminders', generation] as const
  const query = useQuery({ queryKey: key, queryFn: api.list })
  const settings = useQuery({ queryKey: ['userSettings'], queryFn: fetchUserSettings })
  const [form, setForm] = useState<AddReminderBody | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [calendarWanted, setCalendarWanted] = useState(false)
  const [calendarReminder, setCalendarReminder] = useState<Reminder | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const locked = useRef(false)
  const mounted = useRef(true)
  const scrolled = useRef(false)
  useEffect(() => {
    if (!scrolled.current && query.data && window.location.hash === '#custom-reminders') {
      scrolled.current = true
      document.getElementById('custom-reminders')?.scrollIntoView({ block: 'start' })
    }
  }, [query.data])
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const current = () => mounted.current && generation === currentSessionGeneration()
  const run = async (action: () => Promise<string>) => {
    if (locked.current || !current()) return
    locked.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const result = await action()
      if (!current()) return
      setMessage(result)
      await client.invalidateQueries({ queryKey: key })
    } catch (error) {
      if (current()) {
        setFailed(true)
        setMessage(errorMessage(error))
      }
    } finally {
      locked.current = false
      if (current()) setBusy(false)
    }
  }
  const open = (reminder?: Reminder) => {
    setMessage('')
    setCalendarReminder(null)
    setDeleting(null)
    setCalendarWanted(false)
    setEditing(reminder?.id ?? null)
    const timezone =
      reminder?.timezone ?? settings.data?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    setForm(
      reminder
        ? {
            title: reminder.title,
            time_of_day: reminder.time_of_day,
            start_date: reminder.start_date,
            recurrence: reminder.recurrence,
            timezone: reminder.timezone,
            enabled: reminder.enabled,
            link: reminder.link,
          }
        : {
            title: '',
            time_of_day: '20:00',
            start_date: localReminderDate(timezone),
            recurrence: 'daily',
            timezone,
            enabled: true,
            link: null,
          },
    )
  }
  const save = (event: Event) => {
    event.preventDefault()
    if (!form) return
    const body = {
      ...form,
      title: form.title.trim(),
      timezone: form.timezone.trim(),
      link: form.link?.trim() || null,
    }
    const invalid = reminderFormError(body)
    if (invalid) {
      setFailed(true)
      setMessage(invalid)
      return
    }
    void run(async () => {
      const saved = editing ? await api.update(editing, body) : await api.add(body)
      if (current()) {
        setForm(null)
        setEditing(null)
        setCalendarReminder(calendarWanted ? saved : null)
      }
      return 'Custom notification saved.'
    })
  }
  return (
    <SettingsSection
      id="custom-reminders"
      title="Custom notifications"
      class="custom-reminders"
      description="Name a reminder and choose when it repeats. It stays private to your account."
    >
      <p class="field-description">
        The current official Android app checks for notifications periodically, so delivery may be 15 minutes
        or more after the scheduled time. Allow notifications in Android, enable notifications in the app, and
        keep Push on for Reminders above. This is not an exact alarm.
      </p>
      <ReminderLoadStatus query={query} />
      {!!query.data?.reminders.length && (
        <ul class="custom-reminders-list">
          {query.data.reminders.map((reminder) => (
            <li key={reminder.id}>
              <div class="custom-reminder-summary">
                <strong>{reminder.title}</strong>
                <span>
                  {reminderRepeatLabels[reminder.recurrence]} · {reminder.time_of_day} · {reminder.timezone}
                </span>
                <span>
                  {!reminder.enabled
                    ? reminder.recurrence === 'once'
                      ? 'Inactive'
                      : 'Paused'
                    : reminder.next_due_at
                      ? `Next: ${new Intl.DateTimeFormat(undefined, { timeZone: reminder.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(reminder.next_due_at))}`
                      : 'Finished'}
                </span>
              </div>
              <div class="custom-reminder-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open(reminder)}
                  aria-label={`Edit ${reminder.title}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.update(reminder.id, { enabled: !reminder.enabled })
                      if (current()) setCalendarReminder(null)
                      return reminder.enabled ? 'Notification paused.' : 'Notification enabled.'
                    })
                  }
                  aria-label={`${reminder.enabled ? 'Pause' : 'Enable'} ${reminder.title}`}
                >
                  {reminder.enabled ? 'Pause' : 'Enable'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      (await api.test(reminder.id))
                        ? 'Test queued. Check the Android app after its next notification check.'
                        : 'Test not queued: enable In-app or Push for Reminders above.',
                    )
                  }
                  aria-label={`Send test for ${reminder.title}`}
                >
                  Send test
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleting(reminder.id)}
                  aria-label={`Delete ${reminder.title}`}
                >
                  Delete
                </button>
              </div>
              {deleting === reminder.id && (
                <div class="custom-reminder-delete">
                  <p>Delete “{reminder.title}”? Future reminders will stop. Calendar copies are separate.</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.remove(reminder.id)
                        if (current()) {
                          setDeleting(null)
                          if (editing === reminder.id) setForm(null)
                          if (calendarReminder?.id === reminder.id) setCalendarReminder(null)
                        }
                        return 'Custom notification deleted.'
                      })
                    }
                  >
                    Confirm delete
                  </button>{' '}
                  <button type="button" disabled={busy} onClick={() => setDeleting(null)}>
                    Keep notification
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!form && (
        <button type="button" disabled={busy || query.isLoading || !!query.error} onClick={() => open()}>
          Add custom notification
        </button>
      )}
      {form && (
        <form class="custom-reminder-form" onSubmit={save}>
          <h3>{editing ? 'Edit notification' : 'New notification'}</h3>
          <fieldset disabled={busy}>
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={120}
                value={form.title}
                onInput={(e) => setForm({ ...form, title: e.currentTarget.value })}
                placeholder="Evening check-in"
              />
            </label>
            <div class="custom-reminder-grid">
              <label>
                Start date
                <input
                  required
                  type="date"
                  value={form.start_date}
                  onInput={(e) => setForm({ ...form, start_date: e.currentTarget.value })}
                />
              </label>
              <label>
                Time
                <input
                  required
                  type="time"
                  value={form.time_of_day}
                  onInput={(e) => setForm({ ...form, time_of_day: e.currentTarget.value })}
                />
              </label>
              <label>
                Repeat
                <select
                  value={form.recurrence}
                  onChange={(e) =>
                    setForm({ ...form, recurrence: e.currentTarget.value as AddReminderBody['recurrence'] })
                  }
                >
                  {Object.entries(reminderRepeatLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Time zone
                <input
                  required
                  value={form.timezone}
                  onInput={(e) => setForm({ ...form, timezone: e.currentTarget.value })}
                  placeholder="America/Denver"
                />
              </label>
            </div>
            {form.recurrence === 'weekly' && (
              <p class="field-description">Repeats on the weekday of the start date.</p>
            )}
            <label>
              Page to open (optional)
              <input
                value={form.link ?? ''}
                maxLength={500}
                onInput={(e) => setForm({ ...form, link: e.currentTarget.value || null })}
                placeholder="/journal"
              />
            </label>
            <p class="field-description">
              Use a path on this server, such as /journal. Names may appear on your lock screen; keep
              sensitive details out.
            </p>
            <label class="custom-reminder-checkbox">
              <input
                type="checkbox"
                checked={calendarWanted}
                onChange={(e) => setCalendarWanted(e.currentTarget.checked)}
              />
              Offer a 5-minute calendar event after saving
            </label>
            <p class="field-description">
              Opens Google Calendar for you to review the next occurrence only. Connected ICS calendars are
              read-only. Calendar copies do not update when you edit or delete this reminder.
            </p>
            <div class="custom-reminder-actions">
              <button type="submit">{busy ? 'Saving…' : 'Save notification'}</button>
              <button
                type="button"
                onClick={() => {
                  setForm(null)
                  setEditing(null)
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      <ReminderCalendarCopy calendarReminder={calendarReminder} />
    </SettingsSection>
  )
}

function ReminderLoadStatus({ query }: { query: UseQueryResult<RemindersResponse> }) {
  return (
    <>
      {query.isLoading && <p>Loading custom notifications…</p>}
      {query.error && (
        <p role="alert">
          Could not load custom notifications.{' '}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {!query.isLoading && !query.error && query.data?.reminders.length === 0 && (
        <p class="field-description">No custom notifications yet.</p>
      )}
      {query.data?.scheduler_ready === false && (
        <p role="alert">
          Reminder delivery is unavailable on this server. Saved reminders need the server scheduler to start;
          contact the server administrator.
        </p>
      )}
    </>
  )
}

function ReminderCalendarCopy({ calendarReminder }: { calendarReminder: Reminder | null }) {
  const calendarLink = calendarReminder && reminderCalendarLink(calendarReminder, window.location.origin)
  return (
    <>
      {calendarLink && (
        <a class="custom-reminder-calendar" href={calendarLink} target="_blank" rel="noopener noreferrer">
          Add next occurrence to Google Calendar (5 min)
        </a>
      )}
      {calendarReminder && !calendarLink && (
        <p>
          No upcoming occurrence to add to the calendar. Enable the reminder and choose a future time first.
        </p>
      )}
    </>
  )
}
