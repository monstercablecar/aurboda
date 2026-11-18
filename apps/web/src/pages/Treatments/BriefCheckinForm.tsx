import type { AssessmentAnswer, BriefTreatmentAnswers, TreatmentCheckin } from '@aurboda/api-spec'

import axios from 'axios'
import { useEffect, useRef, useState } from 'preact/hooks'

import { AssessmentAbout } from '../../components/AssessmentLibrary/AssessmentAbout'
import { pharmacologyErrorMessage } from '../../state/api/pharmacology'
import { saveTreatmentCheckin } from '../../state/api/treatment-checkins'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { QuestionField } from './AssessmentForm'
import { isoToLocalDateTime, localDateTimeToIso, nowLocalDateTime } from './model'

export const checkinTitle = (entry: TreatmentCheckin): string =>
  entry.questionnaire?.display_name ??
  {
    before: 'Before-session check-in',
    after: 'After-session check-in',
    next_day: 'Next-day check-in',
    later: 'Later follow-up',
    current: 'How you feel now',
    reflection: 'Later reflection',
    custom: 'Selected questionnaire',
  }[entry.kind]
const coreQuestions: { key: keyof BriefTreatmentAnswers; label: string; low: string; high: string }[] = [
  { key: 'mood', label: 'How is your mood?', low: 'Very low', high: 'Very good' },
  { key: 'enjoyment', label: 'How much interest or enjoyment are you feeling?', low: 'None', high: 'A lot' },
  {
    key: 'functioning',
    label: 'How manageable are everyday activities?',
    low: 'Very difficult',
    high: 'Very manageable',
  },
]

export function BriefCheckinForm({
  entry,
  onClose,
  onSaved,
}: {
  entry: TreatmentCheckin
  onClose: () => void
  onSaved: () => void
}) {
  const [answers, setAnswers] = useState<BriefTreatmentAnswers>(entry.draft)
  const [responses, setResponses] = useState<AssessmentAnswer[]>(entry.draft_responses)
  const [observed, setObserved] = useState(
    entry.observed_at ? isoToLocalDateTime(entry.observed_at) : nowLocalDateTime(),
  )
  const [message, setMessage] = useState('Changes are saved as a private draft.')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(currentSessionGeneration())
  const mounted = useRef(true)
  const revision = useRef(entry.revision)
  const pending = useRef<Promise<void>>(Promise.resolve())
  const failed = useRef(false)
  const dirty = useRef(false)
  const closing = useRef(false)
  const latest = useRef({ answers, responses, observed })
  latest.current = { answers, responses, observed }
  const sameSession = () => mounted.current && generation.current === currentSessionGeneration()
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const save = (final: boolean) => {
    const snapshot = latest.current
    const job = pending.current.then(async () => {
      if (!sameSession() || failed.current) {
        throw new Error('Reopen the check-in to load its latest saved draft.')
      }
      const saved = await saveTreatmentCheckin(
        entry.id,
        {
          answers: snapshot.answers,
          responses: snapshot.responses,
          observed_at: localDateTimeToIso(snapshot.observed),
          revision: revision.current,
        },
        final,
      )
      if (!sameSession()) return
      setError('')
      revision.current = saved.revision
      if (
        latest.current.answers === snapshot.answers &&
        latest.current.responses === snapshot.responses &&
        latest.current.observed === snapshot.observed
      ) {
        dirty.current = false
      }
      setMessage(final ? 'Saved. You’re done for now.' : 'Draft saved.')
    })
    pending.current = job.catch((e) => {
      if (!sameSession()) return
      const status = axios.isAxiosError(e) ? e.response?.status : undefined
      failed.current = status === 409 || status === 404
      setError(pharmacologyErrorMessage(e))
      setMessage('Draft could not be saved. Keep this form open to retain your answers.')
    })
    return job
  }
  useEffect(() => {
    if (!dirty.current || closing.current || failed.current) return
    setMessage('Saving draft…')
    const timer = window.setTimeout(() => {
      void save(false).catch(() => {})
    }, 700)
    return () => window.clearTimeout(timer)
  }, [answers, responses, observed])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const set = (key: keyof BriefTreatmentAnswers, value: unknown) => {
    dirty.current = true
    setAnswers((current) => ({ ...current, [key]: value }))
  }
  const finish = async (final: boolean) => {
    if (closing.current) return
    closing.current = true
    setBusy(true)
    try {
      if (final || dirty.current) await save(final)
      else await pending.current
      if (!sameSession() || failed.current) return
      if (final) onSaved()
      else onClose()
    } catch {
      /* The autosave queue retains the error and the user's form. */
    } finally {
      if (sameSession()) {
        closing.current = false
        setBusy(false)
      }
    }
  }
  return (
    <form
      class="treatments-form assessment-form"
      onSubmit={(e) => {
        e.preventDefault()
        void finish(true)
      }}
    >
      <div class="form-heading">
        <h2>{checkinTitle(entry)}</h2>
        <button
          type="button"
          disabled={busy || failed.current}
          onClick={() => void finish(false)}
          aria-label="Save draft and close"
        >
          ×
        </button>
      </div>
      <p>
        {entry.kind === 'reflection'
          ? 'Record what you remember, including uncertainty. This is a later reflection and will not fill a missed next-day check-in.'
          : 'Record what is true for you at this time. Leave anything you cannot answer blank.'}
      </p>
      <p class="form-hint">
        Personal observations. Brief check-ins have no composite score. Entries are not monitored by a
        clinician.
      </p>
      {entry.questionnaire && (
        <>
          <AssessmentAbout template={entry.questionnaire} />
          <p>{entry.questionnaire.description}</p>
        </>
      )}
      <fieldset disabled={busy} class="checkin-fields">
        <label class="field">
          {entry.kind === 'reflection' ? 'Reflection made at' : 'Observed at'} (your device’s local time)
          <input
            type="datetime-local"
            required
            value={observed}
            onInput={(e) => {
              dirty.current = true
              setObserved(e.currentTarget.value)
            }}
          />
        </label>
        {entry.questionnaire ? (
          entry.questionnaire.questions
            .filter((q) => q.enabled)
            .map((question) => (
              <fieldset key={question.id} class="question-field">
                <legend>
                  {question.prompt} {!question.required && <span class="optional-label">Optional</span>}
                </legend>
                <QuestionField
                  question={question}
                  value={
                    question.response_type === 'datetime' &&
                    typeof responses.find((r) => r.question_id === question.id)?.value === 'string'
                      ? isoToLocalDateTime(
                          String(responses.find((r) => r.question_id === question.id)!.value),
                        )
                      : responses.find((r) => r.question_id === question.id)?.value
                  }
                  onChange={(value) => {
                    dirty.current = true
                    setResponses((current) => [
                      ...current.filter((r) => r.question_id !== question.id),
                      ...(value === '' ||
                      value === undefined ||
                      value === null ||
                      (Array.isArray(value) && !value.length)
                        ? []
                        : [
                            {
                              question_id: question.id,
                              question_version: question.version,
                              value:
                                question.response_type === 'datetime'
                                  ? localDateTimeToIso(String(value))
                                  : value,
                            },
                          ]),
                    ])
                  }}
                />
              </fieldset>
            ))
        ) : (
          <BriefFields entry={entry} answers={answers} set={set} />
        )}
      </fieldset>
      <p role="status">{message}</p>
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={onClose}>
            Close and reload the saved draft
          </button>
        </p>
      )}
      <div class="form-actions">
        <button type="button" disabled={busy || failed.current} onClick={() => void finish(false)}>
          Save draft and close
        </button>
        <button class="btn-primary" type="submit" disabled={busy || failed.current}>
          {busy ? 'Saving…' : 'Save check-in'}
        </button>
      </div>
    </form>
  )
}

function BriefFields({
  entry,
  answers,
  set,
}: {
  entry: TreatmentCheckin
  answers: BriefTreatmentAnswers
  set: (key: keyof BriefTreatmentAnswers, value: unknown) => void
}) {
  const rating = (key: keyof BriefTreatmentAnswers, label: string, low: string, high: string) => (
    <fieldset class="question-field" key={key}>
      <legend>
        {label} <span class="optional-label">Optional</span>
      </legend>
      <div class="segments">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={answers[key] === value}
            class={answers[key] === value ? 'segment active' : 'segment'}
            onClick={() => set(key, value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div class="anchor-labels">
        <span>1 · {low}</span>
        <span>5 · {high}</span>
      </div>
      <button class="checkin-clear" type="button" onClick={() => set(key, undefined)}>
        Leave unanswered
      </button>
    </fieldset>
  )
  return (
    <>
      {entry.kind !== 'after' &&
        entry.kind !== 'reflection' &&
        coreQuestions.map((q) => rating(q.key, q.label, q.low, q.high))}
      {entry.kind !== 'after' &&
        entry.kind !== 'reflection' &&
        entry.personal_goal &&
        rating('goal_progress', `Your goal: ${entry.personal_goal}`, 'Very difficult', 'Very manageable')}
      {['next_day', 'later', 'current'].includes(entry.kind) &&
        rating('sleep', 'How was your most recent sleep?', 'Very poor', 'Very good')}
      <fieldset class="question-field">
        <legend>
          Any unwanted effects or difficulties to record? <span class="optional-label">Optional</span>
        </legend>
        <div class="segments">
          {(['none', 'some', 'unsure'] as const).map((value, i) => (
            <button
              type="button"
              class={answers.difficulties === value ? 'segment active' : 'segment'}
              aria-pressed={answers.difficulties === value}
              onClick={() => set('difficulties', value)}
            >
              {['None', 'Some', 'Not sure'][i]}
            </button>
          ))}
        </div>
      </fieldset>
      {answers.difficulties === 'some' && (
        <label class="field">
          What would you like to record? (optional)
          <textarea
            maxLength={2000}
            value={answers.difficulty_detail ?? ''}
            onInput={(e) => set('difficulty_detail', e.currentTarget.value)}
          />
        </label>
      )}
      <label class="field">
        {entry.kind === 'reflection'
          ? 'What do you remember? It is okay to say you do not remember.'
          : 'Anything else you want to remember? (optional)'}
        <textarea
          maxLength={4000}
          value={answers.notes ?? ''}
          onInput={(e) => set('notes', e.currentTarget.value)}
        />
      </label>
    </>
  )
}
