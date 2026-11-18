import type { TreatmentCheckin, TreatmentCheckinPlanBody, TreatmentSession } from '@aurboda/api-spec'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'preact/hooks'

import { pharmacologyErrorMessage } from '../../state/api/pharmacology'
import {
  addTreatmentReflection,
  actOnTreatmentCheckin,
  changeTreatmentCheckinSettings,
  fetchTreatmentCheckins,
} from '../../state/api/treatment-checkins'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { BriefCheckinForm, checkinTitle } from './BriefCheckinForm'
import { CheckinPlanEditor } from './CheckinPlanEditor'
import './checkins.css'

const statusLabels: Record<TreatmentCheckin['status'], string> = {
  upcoming: 'Upcoming',
  due: 'Ready when you are',
  completed: 'Completed',
  skipped: 'Skipped',
  window_passed: 'Window passed · not recorded',
  canceled: 'Canceled',
  record_removed: 'Saved record was voided',
}
const timestamp = (value: string) =>
  new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
function SavedCheckin({ entry }: { entry: TreatmentCheckin }) {
  if (!entry.assessment) return null
  return (
    <details>
      <summary>View saved observations</summary>
      <p>
        {entry.kind === 'reflection' ? 'Reflection made' : 'Observed'}{' '}
        {timestamp(entry.assessment.assessed_at)} · Recorded {timestamp(entry.assessment.created_at)}
      </p>
      {entry.kind === 'reflection' && (
        <p>This later reflection does not replace a missed historical check-in.</p>
      )}
      <dl>
        {entry.assessment.responses.map((answer) => {
          const question = entry.questionnaire?.questions.find((q) => q.id === answer.question_id)
          return (
            <div key={answer.question_id}>
              <dt>{entry.answer_labels[answer.question_id] ?? question?.prompt ?? 'Observation'}</dt>
              <dd>
                {typeof answer.value === 'object' ? JSON.stringify(answer.value) : String(answer.value)}
              </dd>
            </div>
          )
        })}
      </dl>
    </details>
  )
}

const useCheckinQuery = (session?: TreatmentSession) =>
  useQuery({
    queryKey: ['pharmacology', 'treatment-checkins', session?.id ?? 'all'],
    queryFn: () => fetchTreatmentCheckins(session?.id),
    refetchInterval: 60_000,
  })

const checkinDisplay = (data: ReturnType<typeof useCheckinQuery>, compact: boolean) => {
  const entries = data.data?.data ?? []
  const displayed = compact
    ? entries.filter((entry) => entry.status === 'due' && !['current', 'reflection'].includes(entry.kind))
    : entries
  return { entries, displayed, hidden: compact && !displayed.length && !data.error }
}

export function TreatmentCheckins({
  session,
  requestedId,
  compact = false,
}: {
  session?: TreatmentSession
  requestedId?: string
  compact?: boolean
}) {
  const client = useQueryClient()
  const data = useCheckinQuery(session)
  const [active, setActive] = useState<TreatmentCheckin | null>(null)
  const [settings, setSettings] = useState<TreatmentCheckinPlanBody | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [openedRequest, setOpenedRequest] = useState<string | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: ['pharmacology'] })
  useEffect(() => {
    if (!requestedId || openedRequest === requestedId || !data.data) return
    const entry = data.data.data?.find((item) => item.id === requestedId)
    setOpenedRequest(requestedId)
    if (entry?.status === 'due') setActive(entry)
    else setMessage('This check-in is no longer due. Its current status is shown below.')
  }, [requestedId, data.data])
  const run = async (fn: () => Promise<unknown>, success: string) => {
    if (busy) return
    const generation = currentSessionGeneration()
    setBusy(true)
    setError('')
    try {
      await fn()
      if (generation !== currentSessionGeneration()) return
      setMessage(success)
      await refresh()
    } catch (e) {
      if (generation === currentSessionGeneration()) setError(pharmacologyErrorMessage(e))
    } finally {
      if (generation === currentSessionGeneration()) setBusy(false)
    }
  }
  const { entries, displayed, hidden } = checkinDisplay(data, compact)
  if (hidden) return null
  return (
    <section class="treatment-checkins" aria-label="Treatment check-ins">
      <div class="section-heading">
        <div>
          <h3>{compact ? 'Treatment check-ins ready' : 'Your check-ins'}</h3>
          <p>Useful observations, without catching up on stale homework.</p>
        </div>
      </div>
      {data.isLoading && <p role="status">Loading check-ins…</p>}
      {data.error && (
        <p role="alert">
          Could not load check-ins.{' '}
          <button type="button" onClick={() => void data.refetch()}>
            Retry
          </button>
        </p>
      )}
      {!compact && session && (
        <SessionCheckinControls
          session={session}
          data={data}
          entries={entries}
          busy={busy}
          run={run}
          setActive={setActive}
          setSettings={setSettings}
        />
      )}
      {!compact && !session && (
        <p>
          These are the same entries used in Treatments. Open a session to create a check-in or choose its
          follow-up plan. History shows the latest 500 check-ins.
        </p>
      )}
      <div class="checkin-list">
        {displayed.map((entry) => (
          <CheckinCard
            key={entry.id}
            entry={entry}
            session={session}
            busy={busy}
            run={run}
            setActive={setActive}
          />
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {active && (
        <div class="modal-backdrop">
          <div class="modal-sheet" role="dialog" aria-modal="true" aria-label={checkinTitle(active)}>
            <BriefCheckinForm
              key={active.id}
              entry={active}
              onClose={() => {
                setActive(null)
                void refresh()
              }}
              onSaved={() => {
                setActive(null)
                setMessage('Saved. You’re done for now.')
                void refresh()
              }}
            />
          </div>
        </div>
      )}
      {settings && session && (
        <div class="modal-backdrop">
          <form
            class="modal-sheet treatments-form"
            role="dialog"
            aria-modal="true"
            aria-label="Reminder preferences"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await changeTreatmentCheckinSettings(session.id, {
                  reminders_enabled: settings.reminders_enabled,
                  quiet_start: settings.quiet_start,
                  quiet_end: settings.quiet_end,
                })
                setSettings(null)
              }, 'Reminder preferences saved.')
            }}
          >
            <CheckinPlanEditor value={settings} onChange={setSettings} preferencesOnly />
            <div class="form-actions">
              <button type="button" onClick={() => setSettings(null)}>
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                Save preferences
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

type RunCheckinAction = (fn: () => Promise<unknown>, success: string) => Promise<void>
function CheckinCard({
  entry,
  session,
  busy,
  run,
  setActive,
}: {
  entry: TreatmentCheckin
  session?: TreatmentSession
  busy: boolean
  run: RunCheckinAction
  setActive: (entry: TreatmentCheckin) => void
}) {
  return (
    <article key={entry.id} class={`checkin-item checkin-${entry.status}`}>
      <div>
        <h4>{checkinTitle(entry)}</h4>
        <p>{statusLabels[entry.status]}</p>
        {entry.due_at && (
          <small>
            Opens {timestamp(entry.due_at)}
            {entry.expires_at ? ` · Until ${timestamp(entry.expires_at)}` : ''}
          </small>
        )}
        {!entry.due_at && entry.status === 'upcoming' && (
          <small>Waiting for the session’s {entry.kind === 'before' ? 'planned start' : 'actual end'}.</small>
        )}
        {entry.snoozed_until && entry.status === 'due' && (
          <small>Reminder snoozed until {timestamp(entry.snoozed_until)}</small>
        )}
        {!session && (
          <a href={`/treatments?view=journal&treatment=${entry.treatment_session_id}`}>Open session</a>
        )}
      </div>
      <div class="form-actions">
        {entry.status === 'due' && (
          <button class="btn-primary" type="button" onClick={() => setActive(entry)}>
            {Object.keys(entry.draft).length || entry.draft_responses.length ? 'Resume draft' : 'Complete'}
          </button>
        )}
        {entry.status === 'due' && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => actOnTreatmentCheckin(entry.id, { action: 'snooze', snooze_minutes: 60 }),
                'Reminder snoozed, if another reminder was available.',
              )
            }
          >
            Snooze 1 hour
          </button>
        )}
        {['due', 'upcoming', 'window_passed'].includes(entry.status) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => actOnTreatmentCheckin(entry.id, { action: 'skip' }),
                'Skipped. No more reminders for this check-in.',
              )
            }
          >
            Skip
          </button>
        )}
      </div>
      <SavedCheckin entry={entry} />
    </article>
  )
}

function SessionCheckinControls({
  session,
  data,
  entries,
  busy,
  run,
  setActive,
  setSettings,
}: {
  session: TreatmentSession
  data: ReturnType<typeof useCheckinQuery>
  entries: TreatmentCheckin[]
  busy: boolean
  run: RunCheckinAction
  setActive: (entry: TreatmentCheckin) => void
  setSettings: (plan: TreatmentCheckinPlanBody) => void
}) {
  return (
    <>
      {!data.isLoading && !data.error && !data.data?.plan && (
        <p>
          This earlier session has no scheduled check-in plan. Its saved answers remain in the journal; no
          reminders have been added.
        </p>
      )}
      {entries.some((entry) => entry.status === 'window_passed') && (
        <p class="checkin-return">
          Some windows have passed. Leave them unrecorded, add a reflection about what you remember, or record
          how you feel now. Missing answers are never counted as zero.
        </p>
      )}
      {!session.deleted_at && !['canceled', 'archived'].includes(session.status) && (
        <div class="form-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                async () =>
                  setActive(
                    await addTreatmentReflection({ treatment_session_id: session.id, kind: 'current' }),
                  ),
                '',
              )
            }
          >
            Check in about now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                async () =>
                  setActive(
                    await addTreatmentReflection({
                      treatment_session_id: session.id,
                      kind: 'reflection',
                    }),
                  ),
                '',
              )
            }
          >
            Add a later reflection
          </button>
        </div>
      )}
      {data.data?.plan && (
        <button type="button" onClick={() => setSettings(data.data!.plan!)}>
          Reminder preferences
        </button>
      )}
      {data.data?.plan?.reminders_enabled && !data.data.scheduler_ready && (
        <p role="status">
          Reminder delivery is currently unavailable. Your plan is saved; you can still check in here.
        </p>
      )}
    </>
  )
}
