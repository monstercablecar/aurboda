import { useQueryClient } from '@tanstack/react-query'
import { format, subMinutes } from 'date-fns'
import { useEffect, useRef, useState } from 'preact/hooks'

import { addActivity, addEntityComment, fetchActivities, type Activity } from '../../state/api'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { activityId, checkInText, isSleepSession, napBody, sessionLink, sleepMinutes } from './model'

const localTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm")

async function saveNap(start: string, end: string, generation: number) {
  const body = napBody(start, end)
  const existing = await fetchActivities(new Date(body.start_time), new Date(body.end_time!), [
    'sleep',
    'nap',
  ])
  if (generation !== currentSessionGeneration()) return false
  const overlaps = existing
    .filter(isSleepSession)
    .some(
      (s) => s.end_time && new Date(body.start_time) < s.end_time && new Date(body.end_time!) > s.start_time,
    )
  if (overlaps) {
    throw new Error('This overlaps recorded sleep. Review the history before adding a duplicate.')
  }
  const response = await addActivity(body)
  if (!response.success || !response.data) {
    throw new Error('The nap was not confirmed. Check the history before retrying.')
  }

  return true
}

export function SleepTracking({ sessions, onSaved }: { sessions: Activity[]; onSaved: () => void }) {
  const client = useQueryClient()
  const [start, setStart] = useState(() => localTime(subMinutes(new Date(), 20)))
  const [end, setEnd] = useState(() => localTime(new Date()))
  const [selected, setSelected] = useState('')
  const [rested, setRested] = useState('')
  const [waking, setWaking] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const eligible = sessions.filter((s) => activityId(s) && s.end_time)
  const firstId = eligible[0] ? activityId(eligible[0]) : undefined
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId)
  }, [selected, firstId])
  const target = selected

  async function save(kind: 'nap' | 'check-in') {
    if (pending.current) return
    pending.current = true
    const generation = currentSessionGeneration()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (kind === 'nap') {
        if (!(await saveNap(start, end, generation))) return
      } else {
        if (!eligible.some((s) => activityId(s) === target)) throw new Error('Choose a sleep session first.')
        await addEntityComment('activity', target, checkInText(rested, waking, notes))
      }
      if (generation !== currentSessionGeneration()) return
      setMessage(
        kind === 'nap'
          ? 'Nap saved. It is also available in Timeline.'
          : 'Check-in saved to the session notes.',
      )
      if (kind === 'check-in') {
        setRested('')
        setWaking('')
        setNotes('')
      }
      await client.invalidateQueries({ queryKey: ['sleepActivities'] })
      await Promise.all(
        ['activities', 'timeline-activities', 'notes', 'entity-detail'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      if (generation === currentSessionGeneration()) onSaved()
    } catch (cause) {
      if (generation === currentSessionGeneration()) {
        setError(cause instanceof Error ? cause.message : 'Unable to save. Please try again.')
      }
    } finally {
      pending.current = false
      if (generation === currentSessionGeneration()) setBusy(false)
    }
  }

  return (
    <section class="sleep-tracking" aria-label="Sleep tracking">
      <details class="chart-section">
        <summary>☀ Log a nap</summary>
        <p>
          Already synced from your device? Check the history first. Times use your device’s local time zone.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save('nap')
          }}
        >
          <fieldset disabled={busy}>
            <div class="sleep-fields">
              <label>
                Started
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onInput={(e) => setStart(e.currentTarget.value)}
                />
              </label>
              <label>
                Ended
                <input
                  type="datetime-local"
                  required
                  value={end}
                  onInput={(e) => setEnd(e.currentTarget.value)}
                />
              </label>
            </div>
            <div class="sleep-actions">
              <span>Just finished?</span>
              {[10, 20, 30, 60].map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  onClick={() => {
                    const now = new Date()
                    setStart(localTime(subMinutes(now, minutes)))
                    setEnd(localTime(now))
                  }}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <button type="submit">{busy ? 'Saving…' : 'Save nap'}</button>
          </fieldset>
        </form>
      </details>
      <details class="chart-section">
        <summary>☾ Optional sleep check-in</summary>
        <p>A quick personal reflection, saved in the session’s notes. Every question is optional.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save('check-in')
          }}
        >
          <fieldset disabled={busy || eligible.length === 0}>
            <label>
              Sleep session
              <select value={target} onChange={(e) => setSelected(e.currentTarget.value)}>
                {!eligible.some((s) => activityId(s) === target) && (
                  <option value={target}>Choose an available session</option>
                )}
                {eligible.map((s) => (
                  <option key={s.id} value={activityId(s)}>
                    {format(s.start_time, 'MMM d, HH:mm')} · {s.activity_type === 'nap' ? 'Nap' : 'Sleep'}
                  </option>
                ))}
              </select>
            </label>
            <div class="sleep-fields">
              <label>
                How rested do you feel?
                <select value={rested} onChange={(e) => setRested(e.currentTarget.value)}>
                  <option value="">Skip</option>
                  {['Very rested', 'Somewhat rested', 'Neutral', 'Somewhat tired', 'Very tired'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                How often did you wake up?
                <select value={waking} onChange={(e) => setWaking(e.currentTarget.value)}>
                  <option value="">Skip</option>
                  {['None', 'Once', 'Twice', 'Three or more', 'Not sure'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Anything else?
              <textarea
                maxLength={2000}
                value={notes}
                onInput={(e) => setNotes(e.currentTarget.value)}
                placeholder="Optional context about your sleep"
              />
            </label>
            <button type="submit">{busy ? 'Saving…' : 'Save check-in'}</button>
          </fieldset>
        </form>
        {eligible.length === 0 && <p>Record or sync a sleep session to add a check-in.</p>}
      </details>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export function SleepHistory({ sessions }: { sessions: Activity[] }) {
  return (
    <section class="chart-section">
      <h2>Sleep & nap history</h2>
      <p>
        Open a session for stages, source details, notes and corrections. Unmarked short sleep stays
        classified as sleep.
      </p>
      {sessions.length === 0 ? (
        <p>
          No sessions in this period. <a href="/data-sources">Connect a device</a> or log a nap above.
        </p>
      ) : (
        <div class="sleep-history">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Wake time</th>
                <th>Duration</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id ?? s.start_time.toISOString()}>
                  <td>
                    {activityId(s) ? (
                      <a href={sessionLink(s)}>
                        {s.activity_type === 'nap' ? '☀ Nap' : '☾ Sleep'} ·{' '}
                        {format(s.start_time, 'MMM d, HH:mm')}
                      </a>
                    ) : (
                      format(s.start_time, 'MMM d, HH:mm')
                    )}
                  </td>
                  <td>{s.end_time ? format(s.end_time, 'MMM d, HH:mm') : 'In progress'}</td>
                  <td>
                    {sleepMinutes(s) === null ? '—' : `${Math.round(sleepMinutes(s)!)} min`}
                    {s.total_sleep === undefined && s.end_time && ' (session)'}
                  </td>
                  <td>{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
