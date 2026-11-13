import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'
import type { VNode } from 'preact'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'

import { Celebration } from '../../components/Celebration'
import {
  nextCelebration,
  type CelebrationEvent,
  assessmentCelebrationFamily,
} from '../../components/celebration-catalog'
import {
  createQuestionnaire,
  downloadPharmacologyJson,
  fetchAssessments,
  fetchQuestionnaires,
  pharmacologyErrorMessage,
  submitAssessment,
  voidAssessment,
} from '../../state/api/pharmacology'
import { auth } from '../../state/auth'
import {
  bigFiveLongInstrument,
  catalog_version,
  instruments,
  mensaUnscoredInstrument,
  type Instrument,
} from './catalog'
import {
  assessmentBody,
  editableTextFields,
  ensureTemplate,
  entryValues,
  historyFor,
  localTimestamp,
  takenTimestamp,
} from './model'
import './index.css'

function Result({ entry, template }: { entry: Assessment; template: QuestionnaireTemplate }) {
  return (
    <div class="mental-result">
      <p>
        Taken {new Date(entry.assessed_at).toLocaleString(undefined, { timeZone: entry.timezone })} (
        {entry.timezone})<br />
        <small>Recorded {new Date(entry.created_at).toLocaleString()}</small>
      </p>
      <dl>
        {entry.responses.map((answer) => {
          const question = template.questions.find((item) => item.id === answer.question_id)
          return (
            <div key={answer.question_id}>
              <dt>
                {question?.prompt ?? 'Archived question'}
                {question && question.version !== answer.question_version
                  ? ` (version ${answer.question_version})`
                  : ''}
              </dt>
              <dd>
                {typeof answer.value === 'string' || typeof answer.value === 'number'
                  ? String(answer.value)
                  : JSON.stringify(answer.value)}{' '}
                {question?.version === answer.question_version ? question.unit : ''}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
export function AssessmentCard({
  instrument,
  template,
  entries,
  refresh,
  formatControl,
  onSaved,
}: {
  instrument: Instrument
  template?: QuestionnaireTemplate
  entries: Assessment[]
  refresh: () => Promise<unknown>
  onSaved: (key: string) => void
  formatControl?: VNode
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [taken, setTaken] = useState(localTimestamp())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    setValues({})
    setMessage('')
    setFailed(false)
  }, [instrument.key])
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }))
  const save = async (event: Event) => {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const parsed = entryValues(instrument, values)
      const timestamp = takenTimestamp(taken)
      const questionnaire = await ensureTemplate(instrument, {
        list: fetchQuestionnaires,
        create: createQuestionnaire,
      })
      await submitAssessment(
        assessmentBody(questionnaire, parsed, timestamp, Intl.DateTimeFormat().resolvedOptions().timeZone),
      )
      setValues({})
      setTaken(localTimestamp())
      setMessage('Result saved.')
      onSaved(instrument.key)
      await refresh().catch(() => setMessage('Result saved. History could not refresh; reload to see it.'))
    } catch (error) {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    if (
      lock.current ||
      !window.confirm('Delete this result? It will no longer appear in your active history.')
    ) {
      return
    }
    lock.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      await voidAssessment(id)
      await refresh()
      setMessage('Result deleted.')
    } catch (error) {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <article class="mental-card">
      <header>
        <small>
          {instrument.category} · {instrument.provider}
        </small>
        <h2>{instrument.title}</h2>
      </header>
      <p>{instrument.description}</p>
      <p>
        <strong>Evidence:</strong> {instrument.evidence}
      </p>
      <p>
        <strong>Retaking:</strong> {instrument.retake}
      </p>
      <div class="mental-links">
        <a href={instrument.url} target="_blank" rel="noopener noreferrer">
          Take test ↗
        </a>
        <a href={instrument.source} target="_blank" rel="noopener noreferrer">
          Source / scoring ↗
        </a>
      </div>
      <details>
        <summary>Version and availability</summary>
        <p>{instrument.version}</p>
        <p>{instrument.longevity}</p>
      </details>
      {formatControl && <fieldset disabled={busy}>{formatControl}</fieldset>}
      {entries[0] && template ? (
        <div class="mental-latest">
          <strong>Latest saved result</strong>
          <p>{new Date(entries[0].assessed_at).toLocaleString()}</p>
          {instrument.fields.map((field) => {
            const question = template.questions.find((item) => item.stable_key === field.key)
            const answer = entries[0].responses.find((item) => item.question_id === question?.id)
            return answer && question?.version === answer.question_version ? (
              <p key={field.key}>
                {question.prompt}: <strong>{String(answer.value)}</strong> {question.unit}
              </p>
            ) : null
          })}
        </div>
      ) : (
        <p class="mental-empty">No saved result in the loaded history.</p>
      )}
      <details>
        <summary>Record result</summary>
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              Taken at (your local time)
              <input
                type="datetime-local"
                required
                value={taken}
                onInput={(event) => setTaken(event.currentTarget.value)}
              />
            </label>
            {instrument.fields.map((field) => (
              <label key={field.key}>
                {field.label} ({field.unit}; {field.min}–{field.max})
                <input
                  type="number"
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.key] ?? ''}
                  onInput={(event) => setValue(field.key, event.currentTarget.value)}
                />
              </label>
            ))}
            {editableTextFields(instrument).map((field) => (
              <label key={field.key}>
                {field.label}
                {field.required ? ' (required)' : ' (optional)'}
                <textarea
                  required={field.required}
                  maxLength={10000}
                  value={values[field.key] ?? ''}
                  onInput={(event) => setValue(field.key, event.currentTarget.value)}
                />
              </label>
            ))}
          </fieldset>
          <button disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save result'}
          </button>
          <small>Each save creates a separate result. Retake whenever you choose.</small>
        </form>
      </details>
      {message && (
        <p role={failed ? 'alert' : message === 'Result saved.' ? undefined : 'status'}>{message}</p>
      )}
      <details>
        <summary>Saved history ({entries.length})</summary>
        {!entries.length && <p>No results in the loaded history. Record your first result above.</p>}
        {template &&
          entries.map((entry) => (
            <section class="mental-history" key={entry.id}>
              <Result entry={entry} template={template} />
              <a href={`/journal?new=1&source_kind=questionnaire&source_id=${encodeURIComponent(entry.id)}`}>
                Continue reflecting in Journal
              </a>
              <button type="button" disabled={busy} onClick={() => remove(entry.id)}>
                Delete result
              </button>
            </section>
          ))}
      </details>
    </article>
  )
}
function Catalog() {
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const client = useQueryClient()
  const [category, setCategory] = useState('All')
  const [bigFiveFormat, setBigFiveFormat] = useState('120')
  const [mensaFormat, setMensaFormat] = useState('numeric')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const validRange = !start || !end || start <= end
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const templates = useQuery({ queryKey: ['pharmacology', 'questionnaires'], queryFn: fetchQuestionnaires })
  const history = useQuery({
    queryKey: ['pharmacology', 'assessments', 'mental', start, end],
    enabled: validRange,
    queryFn: () =>
      fetchAssessments({
        limit: 1000,
        start: start ? new Date(`${start}T00:00:00`).toISOString() : undefined,
        end: end ? new Date(`${end}T23:59:59.999`).toISOString() : undefined,
      }),
  })
  const refresh = () => client.invalidateQueries({ queryKey: ['pharmacology'] })
  const download = async () => {
    setExporting(true)
    setExportError('')
    try {
      const result = await downloadPharmacologyJson()
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setExportError(pharmacologyErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }
  return (
    <>
      {celebration && (
        <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
      )}
      <div class="mental-toolbar">
        <label>
          Category{' '}
          <select
            value={category}
            onChange={(event) => {
              setCelebration(null)
              setCategory(event.currentTarget.value)
            }}
          >
            {['All', ...new Set(instruments.map((item) => item.category))].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={exporting} onClick={download}>
          {exporting ? 'Exporting…' : 'Download complete history JSON'}
        </button>
      </div>
      <div class="mental-toolbar">
        <label>
          History from (local date)
          <input type="date" value={start} onChange={(event) => setStart(event.currentTarget.value)} />
        </label>
        <label>
          Through
          <input type="date" value={end} onChange={(event) => setEnd(event.currentTarget.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            setStart('')
            setEnd('')
          }}
        >
          Reset dates
        </button>
      </div>
      {!validRange && <p role="alert">The end date must be on or after the start date.</p>}
      <p class="mental-note">
        History shows up to 1,000 assessments within the selected dates across this journal and Treatments.
        Narrow the date range to find older entries. The complete export includes saved assessments, question
        versions, and treatment records.
      </p>
      {history.data?.length === 1000 && (
        <p role="status">
          This range reached the 1,000-result limit. Narrow the dates or export the complete history.
        </p>
      )}
      {exportError && <p role="alert">{exportError}</p>}
      {(templates.isLoading || history.isLoading) && <p role="status">Loading saved results…</p>}
      {(templates.error || history.error) && (
        <p role="alert">
          Saved history could not load: {pharmacologyErrorMessage(templates.error ?? history.error)}{' '}
          <button onClick={refresh}>Retry</button>
        </p>
      )}
      <div class="mental-grid">
        {instruments
          .filter((item) => category === 'All' || item.category === category)
          .map((baseInstrument) => {
            let instrument = baseInstrument
            let formatControl: VNode | undefined
            if (baseInstrument.key === instruments[0].key) {
              instrument = bigFiveFormat === '300' ? bigFiveLongInstrument : baseInstrument
              formatControl = (
                <label>
                  Big Five scoring format
                  <select
                    value={bigFiveFormat}
                    onChange={(event) => {
                      setCelebration(null)
                      setBigFiveFormat(event.currentTarget.value)
                    }}
                  >
                    <option value="120">Out of 120 (24–120 raw points)</option>
                    <option value="300">Out of 300 (60–300 raw points)</option>
                  </select>
                </label>
              )
            }
            if (baseInstrument.key === instruments[1].key) {
              instrument = mensaFormat === 'unscored' ? mensaUnscoredInstrument : baseInstrument
              formatControl = (
                <label>
                  Mensa result format
                  <select
                    value={mensaFormat}
                    onChange={(event) => {
                      setCelebration(null)
                      setMensaFormat(event.currentTarget.value)
                    }}
                  >
                    <option value="numeric">Numeric IQ estimate</option>
                    <option value="unscored">Message without a numeric score</option>
                  </select>
                </label>
              )
            }
            const template = templates.data?.find((item) => item.stable_key === instrument.key)
            return (
              <AssessmentCard
                key={baseInstrument.key}
                formatControl={formatControl}
                instrument={instrument}
                template={template}
                entries={historyFor(history.data ?? [], template)}
                onSaved={(key) => setCelebration(nextCelebration(assessmentCelebrationFamily(key)))}
                refresh={refresh}
              />
            )
          })}
      </div>
    </>
  )
}
export function Assessments() {
  return (
    <div class="mental-page">
      <header>
        <p class="mental-eyebrow">A personal record of your mind</p>
        <h1>Mental assessments</h1>
        <p>
          Take a test externally, then record your results here. Results are saved to your Aurboda account and
          can be exported. These tools do not provide a diagnosis.
        </p>
      </header>
      <details class="mental-method">
        <summary>How to make results useful over time</summary>
        <p>
          Standardized instruments, their online implementations and informal benchmarks have different
          evidence. Keep the same test, version and device; record conditions and first or repeat attempts.
          Practice can improve scores without reflecting a broader change. Links checked {catalog_version};
          availability is not guaranteed.
        </p>
      </details>
      {auth.value.token ? <Catalog /> : <p>Please log in to record and view your results.</p>}
    </div>
  )
}
