import type { QuestionnaireTemplate } from '@aurboda/api-spec'

import {
  assessmentInstruments,
  instrumentScore,
  libraryInstrument,
  isManagedInstrumentKey,
} from '@aurboda/api-spec'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'preact/hooks'

import { AssessmentForm } from '../../pages/Treatments/AssessmentForm'
import { isNutritionQuestionnaire } from '../../pages/Treatments/questionnaire-scope'
import { QuestionnaireForm } from '../../pages/Treatments/QuestionnaireForm'
import {
  createQuestionnaire,
  fetchAssessments,
  fetchQuestionnaires,
  pharmacologyErrorMessage,
} from '../../state/api'
import { AssessmentAbout } from './AssessmentAbout'
import { recordedEntryText } from './model'
import '../../pages/Treatments/style.css'
import '../../pages/Assessments/index.css'

export function AssessmentLibrary({ domain }: { domain: 'mental' | 'physical' }) {
  const client = useQueryClient()
  const templates = useQuery({ queryKey: ['pharmacology', 'questionnaires'], queryFn: fetchQuestionnaires })
  const history = useQuery({
    queryKey: ['pharmacology', 'assessments', 'library'],
    queryFn: () => fetchAssessments({ limit: 1000 }),
  })
  const [active, setActive] = useState<{ template: QuestionnaireTemplate; edit: boolean } | null>(null)
  useEffect(() => {
    if (!active) return
    const region = document.getElementById('active-assessment-form')
    region?.focus({ preventScroll: true })
    region?.scrollIntoView({ block: 'start' })
  }, [active])
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => client.invalidateQueries({ queryKey: ['pharmacology'] })
  const install = async (key: string, custom = false) => {
    const instrument = libraryInstrument(key)
    if (!instrument || busy) return
    setBusy(true)
    setMessage('')
    try {
      const definition = instrument.definition
      const saved = await createQuestionnaire(
        custom
          ? {
              ...definition,
              stable_key: `custom_${crypto.randomUUID().replaceAll('-', '')}`,
              display_name: `Custom: ${definition.display_name}`,
              description:
                'Personal questionnaire adapted from a library instrument. Not validated; no official score.',
              questions: definition.questions.map((q) => ({
                ...q,
                metric_name: null,
                config: Array.isArray(q.config.choices)
                  ? {
                      choices: q.config.choices.map((choice) =>
                        typeof choice === 'string' ? choice : String((choice as { label: string }).label),
                      ),
                    }
                  : q.config,
              })),
            }
          : definition,
      )
      await refresh()
      if (custom) setActive({ template: saved, edit: true })
      setMessage(
        custom
          ? 'Custom copy saved. You can now edit it.'
          : 'Added to your library. No follow-ups or reminders were scheduled.',
      )
    } catch (error) {
      setMessage(pharmacologyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const visible = (templates.data ?? []).filter((t) =>
    t.library
      ? t.library.domain === domain || t.library.domain === 'general'
      : !isNutritionQuestionnaire(t) &&
        t.stable_key !== 'treatment_brief_v1' &&
        !t.stable_key.startsWith('mental_') &&
        !t.stable_key.startsWith('game_'),
  )
  const entries = (history.data ?? []).filter((e) => visible.some((t) => t.id === e.template_id))
  const selectedEntries = entries.filter((e) => selected.includes(e.id))
  const summary = selectedEntries
    .map((e) =>
      recordedEntryText(
        e,
        visible.find((t) => t.id === e.template_id)!,
      ),
    )
    .join('\n\n')
  const download = () => {
    const blob = new Blob(
      [
        `Personal appointment notes\nSelected observations only; omitted periods are not zero. Recall windows may overlap. These entries are not clinician-monitored and do not establish treatment effects.\n\n${summary}`,
      ],
      { type: 'text/plain;charset=utf-8' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'appointment-observations.txt'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section class="assessment-library" aria-label="Shared assessment library">
      <h2>Your assessment library</h2>
      <p>
        Choose only what helps you understand your experience. Leaving an assessment unselected creates no
        task or reminder.
      </p>
      <a href="/add?tab=questionnaire">Build a questionnaire</a>
      {message && <p role="status">{message}</p>}
      {(templates.isLoading || history.isLoading) && <p role="status">Loading library…</p>}
      {(templates.error || history.error) && (
        <p role="alert">
          The library could not load. <button onClick={refresh}>Retry</button>
        </p>
      )}
      {active ? (
        <div id="active-assessment-form" tabIndex={-1}>
          {active.edit ? (
            <QuestionnaireForm
              key={active.template.id}
              simple
              template={active.template}
              onCancel={() => setActive(null)}
              onSaved={(m) => {
                setMessage(m)
                setActive(null)
                void refresh()
              }}
            />
          ) : (
            <>
              <AssessmentForm
                key={active.template.id}
                template={active.template}
                timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
                onCancel={() => setActive(null)}
                onSaved={() => {
                  setActive(null)
                  setMessage('Observation saved.')
                  void refresh()
                }}
              />
            </>
          )}
        </div>
      ) : null}
      <div class="mental-grid">
        {assessmentInstruments
          .filter(
            (i) =>
              i.definition.library?.domain === domain &&
              !templates.data?.some((t) => t.stable_key === i.definition.stable_key),
          )
          .map((i) => (
            <article class="mental-card" key={i.definition.stable_key}>
              <h3>{i.definition.display_name}</h3>
              <p>{i.purpose}</p>
              <p>
                Recall: {i.definition.library?.recall_period} · About{' '}
                {i.definition.library?.estimated_minutes} minutes
              </p>
              <p>{i.repeat}</p>
              <button disabled={busy || !templates.data} onClick={() => install(i.definition.stable_key)}>
                Add to my library
              </button>
            </article>
          ))}
        {visible.map((template) => {
          const saved = entries.filter((e) => e.template_id === template.id)
          const instrument = libraryInstrument(template.stable_key)
          const comparable = saved.filter(
            (e) => e.template_version === template.version && instrumentScore(template, e) !== null,
          )
          const latest = comparable[0]
          const previous = comparable[1]
          return (
            <article class="mental-card" key={template.id}>
              <h3>{template.display_name}</h3>
              <AssessmentAbout template={template} />
              <button disabled={!template.enabled} onClick={() => setActive({ template, edit: false })}>
                Start questionnaire
              </button>
              {isManagedInstrumentKey(template.stable_key) ? (
                <button disabled={busy} onClick={() => install(template.stable_key, true)}>
                  Make a custom copy
                </button>
              ) : (
                <button onClick={() => setActive({ template, edit: true })}>Edit template</button>
              )}
              {instrument && latest && (
                <p>
                  Recorded {new Date(latest.assessed_at).toLocaleDateString()}:{' '}
                  {instrumentScore(template, latest)?.toFixed(instrument.scoring === 'mean' ? 2 : 0)}/
                  {instrument.score_max}.
                  {previous && (
                    <>
                      {' '}
                      Change from {new Date(previous.assessed_at).toLocaleDateString()}:{' '}
                      {(instrumentScore(template, latest)! - instrumentScore(template, previous)!).toFixed(2)}{' '}
                      points.
                    </>
                  )}{' '}
                  Higher scores mean more reported symptoms or interference. This does not establish a
                  treatment effect.
                </p>
              )}
              <details>
                <summary>Saved observations ({saved.length})</summary>
                {saved.map((entry) => (
                  <section key={entry.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(entry.id)}
                        onChange={(e) =>
                          setSelected((current) =>
                            e.currentTarget.checked
                              ? [...current, entry.id]
                              : current.filter((id) => id !== entry.id),
                          )
                        }
                      />
                      Include observation from {new Date(entry.assessed_at).toLocaleString()} in appointment
                      notes
                    </label>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {recordedEntryText(entry, template)}
                    </pre>
                  </section>
                ))}
              </details>
            </article>
          )
        })}
      </div>
      <p>
        History loads the latest 1,000 assessments across your account. Missing answers stay missing. Older
        records remain in the complete history export on Mental Assessments.
      </p>
      {selectedEntries.length > 0 && (
        <section>
          <h3>Appointment notes preview</h3>
          <p>Only the observations you selected will be downloaded. Review them before sharing.</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{summary}</pre>
          <button onClick={download}>Download selected appointment notes</button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </section>
      )}
    </section>
  )
}
