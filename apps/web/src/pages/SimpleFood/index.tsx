import type {
  Assessment,
  ContextEvent,
  ContextEventType,
  CreateContextEventBody,
  QuestionnaireTemplate,
} from '@aurboda/api-spec'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, subDays } from 'date-fns'
import { useLocation } from 'preact-iso'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { Celebration } from '../../components/Celebration'
import { nextCelebration, type CelebrationEvent } from '../../components/celebration-catalog'
import {
  correctAssessment,
  createContextEvent,
  createContextType,
  createQuestionnaire,
  fetchAssessments,
  fetchContextEvents,
  fetchContextTypes,
  fetchQuestionnaires,
  pharmacologyErrorMessage,
  submitAssessment,
  updateContextEvent,
  voidAssessment,
  voidContextEvent,
} from '../../state/api/pharmacology'
import { auth } from '../../state/auth'
import {
  assessmentForLocalDate,
  categoryCount,
  choiceLabel,
  completedAssessments,
  contextTypeByKey,
  dateKeyInZone,
  formatAnswer,
  isoToLocalDateTime,
  latestAssessmentForTemplate,
  latestDraftAssessment,
  latestEventByType,
  localDateKey,
  localDateTimeToIso,
  localDateToNoonIso,
  managedContextTypes,
  managedSimpleFoodTemplates,
  nowLocalDateTime,
  optionsForQuestion,
  questionDescription,
  questionSection,
  questionnaireByKey,
  responseMap,
  scoreReapsAssessment,
  sectionVerdict,
  shiftDate,
  simpleFoodEvents,
  simpleFoodMetricNames,
  SIMPLE_FOOD_BLOATING_KEY,
  SIMPLE_FOOD_DAILY_KEY,
  SIMPLE_FOOD_FULLNESS_KEY,
  SIMPLE_FOOD_INTAKE_KEY,
  SIMPLE_FOOD_REAPS_KEY,
  SIMPLE_FOOD_REFLUX_KEY,
  simpleFoodUrl,
  simpleFoodViews,
  symptomTimeBucket,
  type ChoiceOption,
  viewForQuery,
} from './model'
import './style.css'

type AnswerMap = Record<string, unknown>

const answered = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)

async function ensureSimpleFoodResources(): Promise<{
  contextTypes: ContextEventType[]
  templates: QuestionnaireTemplate[]
}> {
  const ensureTemplates = async (): Promise<QuestionnaireTemplate[]> => {
    let templates = await fetchQuestionnaires()
    for (const definition of managedSimpleFoodTemplates) {
      if (templates.some((template) => template.stable_key === definition.stable_key)) continue
      try {
        await createQuestionnaire(definition)
      } catch (error) {
        const message = pharmacologyErrorMessage(error)
        if (!/exist|duplicate|unique/i.test(message)) throw error
      }
      templates = await fetchQuestionnaires()
    }
    return templates
  }

  const ensureContextTypes = async (): Promise<ContextEventType[]> => {
    let types = await fetchContextTypes()
    for (const definition of managedContextTypes) {
      if (types.some((type) => type.key === definition.key)) continue
      try {
        await createContextType(definition)
      } catch (error) {
        const message = pharmacologyErrorMessage(error)
        if (!/exist|duplicate|unique/i.test(message)) throw error
      }
      types = await fetchContextTypes()
    }
    return types
  }

  const [templates, contextTypes] = await Promise.all([ensureTemplates(), ensureContextTypes()])
  return { templates, contextTypes }
}

function StatusBanner({
  tone = 'success',
  text,
  announce = true,
}: {
  text: string
  tone?: 'error' | 'success'
  announce?: boolean
}) {
  return (
    <div
      class={tone === 'error' ? 'simple-food-banner error' : 'simple-food-banner'}
      role={tone === 'error' ? 'alert' : announce ? 'status' : undefined}
    >
      {text}
    </div>
  )
}

function ChoiceButton({
  active,
  detail,
  label,
  onClick,
}: {
  active: boolean
  detail?: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      class={active ? 'simple-food-choice active' : 'simple-food-choice'}
      type="button"
      onClick={onClick}
    >
      <strong>{label}</strong>
      {detail && <small>{detail}</small>}
    </button>
  )
}

// eslint-disable-next-line complexity -- dynamic form renderer supports every response type used by the managed nutrition templates
function QuestionField({
  onChange,
  question,
  value,
}: {
  onChange: (value: unknown) => void
  question: QuestionnaireTemplate['questions'][number]
  value: unknown
}) {
  const options = optionsForQuestion(question)
  switch (question.response_type) {
    case 'single_choice':
      return (
        <div class="simple-food-choice-grid">
          {options.map((optionItem) => (
            <ChoiceButton
              active={value === optionItem.value}
              detail={optionItem.detail}
              key={optionItem.value}
              label={optionItem.label}
              onClick={() => onChange(optionItem.value)}
            />
          ))}
        </div>
      )
    case 'multiple_choice': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div class="simple-food-choice-grid compact">
          {options.map((optionItem) => (
            <ChoiceButton
              active={selected.includes(optionItem.value)}
              detail={optionItem.detail}
              key={optionItem.value}
              label={optionItem.label}
              onClick={() =>
                onChange(
                  selected.includes(optionItem.value)
                    ? selected.filter((item) => item !== optionItem.value)
                    : [...selected, optionItem.value],
                )
              }
            />
          ))}
        </div>
      )
    }
    case 'yes_no':
      return (
        <div class="simple-food-choice-grid compact">
          <ChoiceButton active={value === true} label="Yes" onClick={() => onChange(true)} />
          <ChoiceButton active={value === false} label="No" onClick={() => onChange(false)} />
        </div>
      )
    case 'numeric':
      return (
        <input
          class="simple-food-input"
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={typeof question.config.min === 'number' ? question.config.min : undefined}
          max={typeof question.config.max === 'number' ? question.config.max : undefined}
          step={typeof question.config.step === 'number' ? question.config.step : 'any'}
          onInput={(event) => {
            const next = (event.target as HTMLInputElement).value
            onChange(next === '' ? undefined : Number(next))
          }}
        />
      )
    case 'short_text':
      return (
        <input
          class="simple-food-input"
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={typeof question.config.placeholder === 'string' ? question.config.placeholder : ''}
          onInput={(event) => onChange((event.target as HTMLInputElement).value)}
        />
      )
    case 'long_text':
      return (
        <textarea
          class="simple-food-textarea"
          rows={4}
          value={typeof value === 'string' ? value : ''}
          placeholder={typeof question.config.placeholder === 'string' ? question.config.placeholder : ''}
          onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)}
        />
      )
    case 'datetime':
      return (
        <input
          class="simple-food-input"
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onInput={(event) => onChange((event.target as HTMLInputElement).value)}
        />
      )
    case 'likert':
      return (
        <div class="simple-food-choice-grid compact">
          {Array.from(
            {
              length:
                (typeof question.config.max === 'number' ? question.config.max : 5) -
                (typeof question.config.min === 'number' ? question.config.min : 1) +
                1,
            },
            (_, index) => index + (typeof question.config.min === 'number' ? question.config.min : 1),
          ).map((number) => (
            <ChoiceButton
              active={value === number}
              key={number}
              label={String(number)}
              onClick={() => onChange(number)}
            />
          ))}
        </div>
      )
    case 'tags':
      return (
        <input
          class="simple-food-input"
          type="text"
          value={Array.isArray(value) ? value.join(', ') : ''}
          placeholder="tag1, tag2"
          onInput={(event) =>
            onChange(
              (event.target as HTMLInputElement).value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
      )
  }
}

function AssessmentHistory({
  entries,
  onDelete,
  renderSummary,
  template,
}: {
  entries: Assessment[]
  onDelete?: (assessment: Assessment) => void
  renderSummary?: (assessment: Assessment) => preact.ComponentChildren
  template: QuestionnaireTemplate
}) {
  const questions = new Map(template.questions.map((question) => [question.id, question]))
  return (
    <div class="simple-food-history-list">
      {entries.map((entry) => (
        <article class="simple-food-history-item" key={entry.id}>
          <div class="simple-food-history-head">
            <div>
              <strong>
                {new Date(entry.assessed_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: entry.timezone,
                })}
              </strong>
              <small>Updated {new Date(entry.updated_at).toLocaleString()}</small>
            </div>
            {onDelete && (
              <button class="link-button danger" type="button" onClick={() => onDelete(entry)}>
                Delete
              </button>
            )}
          </div>
          {renderSummary?.(entry)}
          {entry.notes && <p class="simple-food-note-preview">{entry.notes}</p>}
          <dl class="simple-food-history-grid">
            {entry.responses.map((response) => {
              const question = questions.get(response.question_id)
              return (
                <div key={response.question_id}>
                  <dt>{question?.prompt ?? 'Archived question'}</dt>
                  <dd>{formatAnswer(question, response.value)}</dd>
                </div>
              )
            })}
          </dl>
        </article>
      ))}
    </div>
  )
}

export function AssessmentEditor({
  assessments,
  intro,
  onRefresh,
  template,
  timezone,
  title,
  historySummary,
}: {
  assessments: Assessment[]
  historySummary?: (assessment: Assessment) => preact.ComponentChildren
  intro: preact.ComponentChildren
  onRefresh: () => Promise<unknown>
  template: QuestionnaireTemplate
  timezone: string
  title: string
}) {
  const queryClient = useQueryClient()
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const questions = useMemo(
    () =>
      template.questions
        .filter((question) => question.enabled)
        .sort((left, right) => left.sort_order - right.sort_order),
    [template],
  )
  const completed = useMemo(() => completedAssessments(assessments, template.id), [assessments, template.id])
  const draft = useMemo(() => latestDraftAssessment(assessments, template.id), [assessments, template.id])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [notes, setNotes] = useState('')
  const [assessedLocal, setAssessedLocal] = useState(nowLocalDateTime())
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!draft) {
      setAnswers({})
      setNotes('')
      setAssessedLocal(nowLocalDateTime())
      return
    }
    setAnswers(responseMap(draft, template))
    setNotes(draft.notes ?? '')
    setAssessedLocal(isoToLocalDateTime(draft.assessed_at))
  }, [draft?.id, template])

  const grouped = useMemo(() => {
    const bySection = new Map<string, QuestionnaireTemplate['questions']>()
    for (const question of questions) {
      const section = questionSection(question)
      bySection.set(section, [...(bySection.get(section) ?? []), question])
    }
    return [...bySection.entries()]
  }, [questions])

  const save = useMutation({
    mutationFn: async (stage: 'completed' | 'draft') => {
      const responses = questions
        .filter((question) => answered(answers[question.stable_key]))
        .map((question) => ({
          question_id: question.id,
          question_version: question.version,
          value:
            question.response_type === 'datetime'
              ? localDateTimeToIso(String(answers[question.stable_key]))
              : answers[question.stable_key],
        }))
      if (!responses.length && !notes.trim()) {
        throw new Error('Add at least one answer or note before saving.')
      }
      const body = {
        assessed_at: localDateTimeToIso(assessedLocal),
        notes: notes.trim() || undefined,
        responses,
        stage,
        template_id: template.id,
        timezone,
      }
      const wasCompleted = draft?.stage === 'completed'
      const assessment = await (draft ? correctAssessment(draft.id, body) : submitAssessment(body))
      return { assessment, celebrate: stage === 'completed' && !wasCompleted }
    },
    onError: (error) => {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    },
    onSuccess: async ({ celebrate }, stage) => {
      if (celebrate) setCelebration(nextCelebration('nutrition-assessment'))
      setFailed(false)
      setMessage(stage === 'draft' ? 'Draft saved.' : 'Assessment saved.')
      if (stage === 'completed') {
        setAnswers({})
        setNotes('')
        setAssessedLocal(nowLocalDateTime())
      }
      await queryClient.invalidateQueries({ queryKey: ['simple-food-assessments'] })
      await onRefresh()
    },
  })

  const discardDraft = useMutation({
    mutationFn: async () => {
      if (!draft) return
      await voidAssessment(draft.id)
    },
    onError: (error) => {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    },
    onSuccess: async () => {
      setFailed(false)
      setMessage('Draft discarded.')
      setAnswers({})
      setNotes('')
      setAssessedLocal(nowLocalDateTime())
      await queryClient.invalidateQueries({ queryKey: ['simple-food-assessments'] })
      await onRefresh()
    },
  })

  return (
    <div class="simple-food-page">
      {celebration && (
        <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
      )}
      <section class="simple-food-card">
        <header class="simple-food-card-header compact">
          <div>
            <p class="simple-food-eyebrow">Detailed nutrition assessment</p>
            <h2>{title}</h2>
          </div>
        </header>
        <div class="simple-food-copy">{intro}</div>
        {draft && (
          <div class="simple-food-inline-callout">
            <div>
              <strong>Saved draft in progress</strong>
              <small>Updated {new Date(draft.updated_at).toLocaleString()}</small>
            </div>
            <button
              class="link-button danger"
              type="button"
              disabled={discardDraft.isPending}
              onClick={() => discardDraft.mutate()}
            >
              {discardDraft.isPending ? 'Discarding…' : 'Discard draft'}
            </button>
          </div>
        )}
        <label class="simple-food-field">
          <span>Recorded at (your local time)</span>
          <input
            class="simple-food-input"
            type="datetime-local"
            value={assessedLocal}
            onInput={(event) => setAssessedLocal((event.target as HTMLInputElement).value)}
          />
        </label>
        {grouped.map(([section, sectionQuestions]) => (
          <section class="simple-food-question-group" key={section}>
            <h3>{section}</h3>
            {sectionQuestions.map((question) => (
              <div class="simple-food-question-block" key={question.id}>
                <div class="simple-food-question-title">
                  <strong>{question.prompt}</strong>
                  {!question.required && <span>Optional</span>}
                </div>
                {questionDescription(question) && (
                  <p class="simple-food-help">{questionDescription(question)}</p>
                )}
                <QuestionField
                  question={question}
                  value={answers[question.stable_key]}
                  onChange={(value) =>
                    setAnswers((current) => ({ ...current, [question.stable_key]: value }))
                  }
                />
              </div>
            ))}
          </section>
        ))}
        <details class="simple-food-details">
          <summary>Add a note</summary>
          <textarea
            class="simple-food-textarea"
            rows={4}
            value={notes}
            onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
          />
        </details>
        {message && (
          <StatusBanner
            text={message}
            tone={failed ? 'error' : 'success'}
            announce={message !== 'Assessment saved.'}
          />
        )}
        <div class="simple-food-actions">
          <button
            class="secondary"
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate('draft')}
          >
            {save.isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" disabled={save.isPending} onClick={() => save.mutate('completed')}>
            {save.isPending ? 'Saving…' : 'Complete assessment'}
          </button>
        </div>
      </section>

      <section class="simple-food-card">
        <header class="simple-food-card-header compact">
          <div>
            <p class="simple-food-eyebrow">History</p>
            <h2>
              {completed.length} completed {completed.length === 1 ? 'entry' : 'entries'}
            </h2>
          </div>
        </header>
        {!completed.length && <p>No completed assessments yet.</p>}
        {!!completed.length && (
          <AssessmentHistory entries={completed} renderSummary={historySummary} template={template} />
        )}
      </section>
    </div>
  )
}

export function DailyNutritionCard({
  assessments,
  onRefresh,
  template,
  timezone,
}: {
  assessments: Assessment[]
  onRefresh: () => Promise<unknown>
  template: QuestionnaireTemplate
  timezone: string
}) {
  const queryClient = useQueryClient()
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const [selectedDate, setSelectedDate] = useState(localDateKey())
  const currentDate = useRef(selectedDate)
  currentDate.current = selectedDate
  const savedDates = useRef(new Set<string>())
  useEffect(() => setCelebration(null), [selectedDate])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const existing = useMemo(
    () => assessmentForLocalDate(assessments, template.id, selectedDate),
    [assessments, template.id, selectedDate],
  )
  const questions = template.questions.filter((question) => question.enabled)

  useEffect(() => {
    setAnswers(responseMap(existing, template))
    setNotes(existing?.notes ?? '')
    setMessage('')
    setFailed(false)
  }, [existing?.id, selectedDate, template])

  const save = useMutation({
    mutationFn: async () => {
      const responses = questions
        .filter((question) => answered(answers[question.stable_key]))
        .map((question) => ({
          question_id: question.id,
          question_version: question.version,
          value: answers[question.stable_key],
        }))
      if (!responses.length && !notes.trim()) {
        throw new Error('Select at least one answer or add a note before saving.')
      }
      const body = {
        assessed_at: localDateToNoonIso(selectedDate),
        notes: notes.trim() || undefined,
        responses,
        stage: 'completed',
        template_id: template.id,
        timezone,
      }
      const isNew = !existing
      const assessment = await (existing ? correctAssessment(existing.id, body) : submitAssessment(body))
      return { assessment, isNew, date: selectedDate }
    },
    onError: (error) => {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    },
    onSuccess: async ({ isNew, date }) => {
      setFailed(false)
      setMessage(isNew ? 'Daily check saved.' : 'Daily check updated.')
      if (isNew && !savedDates.current.has(date) && date === currentDate.current) {
        setCelebration(nextCelebration('nutrition-daily'))
      }
      savedDates.current.add(date)
      await queryClient.invalidateQueries({ queryKey: ['simple-food-assessments'] })
      await onRefresh()
    },
  })

  return (
    <section class="simple-food-card">
      {celebration && (
        <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
      )}
      <header class="simple-food-card-header">
        <div>
          <p class="simple-food-eyebrow">A. Daily nutrition check</p>
          <h2>Fast, subjective, and consistent</h2>
          <p>
            Current local calendar day by default. No calories, ingredient weights, or meal reconstruction.
          </p>
        </div>
        <div class="simple-food-date-controls">
          <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}>
            Previous
          </button>
          <input
            type="date"
            value={selectedDate}
            max={localDateKey()}
            onInput={(event) => setSelectedDate((event.target as HTMLInputElement).value)}
          />
          <button type="button" onClick={() => setSelectedDate(localDateKey())}>
            Today
          </button>
        </div>
      </header>
      <div class="simple-food-inline-callout">
        <div>
          <strong>{existing ? 'Saved for this date' : 'Not yet saved for this date'}</strong>
          <small>
            {existing
              ? `Last edited ${new Date(existing.updated_at).toLocaleString(undefined, { timeZone: existing.timezone })}`
              : 'Missing stays missing; unknown stays distinct from missing.'}
          </small>
        </div>
      </div>
      {questions.map((question) => (
        <div class="simple-food-question-block" key={question.id}>
          <div class="simple-food-question-title">
            <strong>{question.prompt}</strong>
          </div>
          {questionDescription(question) && <p class="simple-food-help">{questionDescription(question)}</p>}
          <QuestionField
            question={question}
            value={answers[question.stable_key]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.stable_key]: value }))}
          />
        </div>
      ))}
      <details class="simple-food-details">
        <summary>Optional notes</summary>
        <textarea
          class="simple-food-textarea"
          rows={3}
          value={notes}
          onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
        />
      </details>
      {message && (
        <StatusBanner
          text={message}
          tone={failed ? 'error' : 'success'}
          announce={message !== 'Daily check saved.'}
        />
      )}
      <div class="simple-food-actions">
        <button
          class="secondary"
          type="button"
          onClick={() => {
            setAnswers({})
            setNotes('')
            setMessage('')
            setFailed(false)
          }}
        >
          Clear
        </button>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save daily check'}
        </button>
      </div>
    </section>
  )
}

const fullnessLabels = ['Empty / hungry', 'Neutral', 'Comfortably full', 'Very full', 'Uncomfortably full']
const symptomLabels = ['None', 'Mild', 'Moderate', 'Severe']
const mealContextOptions: ChoiceOption[] = [
  { value: 'under_1_hour', label: '< 1 hour ago' },
  { value: 'one_to_three_hours', label: '1–3 hours ago' },
  { value: 'three_to_six_hours', label: '3–6 hours ago' },
  { value: 'over_6_hours', label: '6+ hours ago' },
  { value: 'not_sure', label: 'Not sure' },
]
const refluxDesignationOptions: ChoiceOption[] = [
  { value: 'heartburn', label: 'Heartburn / burning sensation' },
  { value: 'regurgitation', label: 'Regurgitation / acid coming up' },
  { value: 'both', label: 'Both' },
  { value: 'unsure', label: 'Unsure' },
]

function SymptomEntryEditor({
  entry,
  onCancel,
  onSaved,
}: {
  entry: ContextEvent
  onCancel: () => void
  onSaved: () => Promise<unknown>
}) {
  const [startedLocal, setStartedLocal] = useState(isoToLocalDateTime(entry.started_at))
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [intensity, setIntensity] = useState<number>(Number(entry.intensity ?? 0))
  const [mealContext, setMealContext] = useState(
    typeof entry.metadata.time_since_last_meal === 'string'
      ? String(entry.metadata.time_since_last_meal)
      : '',
  )
  const [designation, setDesignation] = useState(
    typeof entry.metadata.reflux_designation === 'string' ? String(entry.metadata.reflux_designation) : '',
  )
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async () => {
      const metadata: Record<string, unknown> = {
        ...entry.metadata,
        source: 'simple_food',
      }
      if (mealContext) metadata.time_since_last_meal = mealContext
      else delete metadata.time_since_last_meal
      if (entry.event_type.key === SIMPLE_FOOD_REFLUX_KEY && intensity > 0 && designation) {
        metadata.reflux_designation = designation
      } else delete metadata.reflux_designation
      await updateContextEvent(entry.id, {
        started_at: localDateTimeToIso(startedLocal),
        intensity,
        metadata,
        notes: notes.trim() || null,
        timezone: entry.timezone,
      })
    },
    onError: (error) => {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    },
    onSuccess: async () => {
      setFailed(false)
      setMessage('Entry updated.')
      await queryClient.invalidateQueries({ queryKey: ['simple-food-context-events'] })
      await onSaved()
      onCancel()
    },
  })

  const labels = entry.event_type.key === SIMPLE_FOOD_FULLNESS_KEY ? fullnessLabels : symptomLabels

  return (
    <div class="simple-food-editor">
      <div class="simple-food-choice-grid compact">
        {labels.map((label, index) => (
          <ChoiceButton
            active={intensity === index}
            key={label}
            label={label}
            onClick={() => setIntensity(index)}
          />
        ))}
      </div>
      <label class="simple-food-field compact">
        <span>Timestamp</span>
        <input
          class="simple-food-input"
          type="datetime-local"
          value={startedLocal}
          onInput={(event) => setStartedLocal((event.target as HTMLInputElement).value)}
        />
      </label>
      <label class="simple-food-field compact">
        <span>Time since last meal</span>
        <select
          class="simple-food-select"
          value={mealContext}
          onChange={(event) => setMealContext((event.target as HTMLSelectElement).value)}
        >
          <option value="">Not set</option>
          {mealContextOptions.map((optionItem) => (
            <option key={optionItem.value} value={optionItem.value}>
              {optionItem.label}
            </option>
          ))}
        </select>
      </label>
      {entry.event_type.key === SIMPLE_FOOD_REFLUX_KEY && intensity > 0 && (
        <label class="simple-food-field compact">
          <span>Reflux symptom type</span>
          <select
            class="simple-food-select"
            value={designation}
            onChange={(event) => setDesignation((event.target as HTMLSelectElement).value)}
          >
            <option value="">Not set</option>
            {refluxDesignationOptions.map((optionItem) => (
              <option key={optionItem.value} value={optionItem.value}>
                {optionItem.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label class="simple-food-field compact">
        <span>Optional note</span>
        <textarea
          class="simple-food-textarea"
          rows={3}
          value={notes}
          onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
        />
      </label>
      {message && <StatusBanner text={message} tone={failed ? 'error' : 'success'} />}
      <div class="simple-food-actions compact">
        <button class="secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function SymptomLoggerCard({
  eventType,
  events,
  labels,
  onRefresh,
  prompt,
}: {
  eventType: ContextEventType
  events: ContextEvent[]
  labels: string[]
  onRefresh: () => Promise<unknown>
  prompt: string
}) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const latest = latestEventByType(events, eventType.key)
  const mutation = useMutation({
    mutationFn: async (value: number) =>
      createContextEvent({
        event_type_id: eventType.id,
        started_at: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        intensity: value,
        metadata: { source: 'simple_food' },
      } satisfies CreateContextEventBody),
    onError: (error) => {
      setFailed(true)
      setMessage(pharmacologyErrorMessage(error))
    },
    onSuccess: async (_entry, value) => {
      setFailed(false)
      setMessage(`Saved “${labels[value]}”.`)
      await queryClient.invalidateQueries({ queryKey: ['simple-food-context-events'] })
      await onRefresh()
    },
  })

  return (
    <section class="simple-food-card symptom-card">
      <header class="simple-food-card-header compact">
        <div>
          <p class="simple-food-eyebrow">Quick check-in</p>
          <h3>{eventType.display_name.replace(/^Simple Food ·\s*/, '')}</h3>
        </div>
        <div class="simple-food-latest-chip">
          <span>Latest</span>
          <strong>{latest && latest.intensity != null ? labels[Number(latest.intensity)] : '—'}</strong>
        </div>
      </header>
      <p class="simple-food-help">{prompt}</p>
      <div class="simple-food-choice-grid compact">
        {labels.map((label, index) => (
          <ChoiceButton key={label} active={false} label={label} onClick={() => mutation.mutate(index)} />
        ))}
      </div>
      {message && <StatusBanner text={message} tone={failed ? 'error' : 'success'} />}
    </section>
  )
}

function DigestiveCheckIn({
  contextTypes,
  events,
  onRefresh,
}: {
  contextTypes: ContextEventType[]
  events: ContextEvent[]
  onRefresh: () => Promise<unknown>
}) {
  const fullnessType = contextTypeByKey(contextTypes, SIMPLE_FOOD_FULLNESS_KEY)
  const bloatingType = contextTypeByKey(contextTypes, SIMPLE_FOOD_BLOATING_KEY)
  const refluxType = contextTypeByKey(contextTypes, SIMPLE_FOOD_REFLUX_KEY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; timeout: number } | null>(
    null,
  )
  const visibleEvents = simpleFoodEvents(events)
    .filter((event) => event.id !== pendingDelete?.id)
    .sort((left, right) => right.started_at.localeCompare(left.started_at))
    .slice(0, 12)
  const editing =
    visibleEvents.find((event) => event.id === editingId) ??
    simpleFoodEvents(events).find((event) => event.id === editingId)

  useEffect(
    () => () => {
      if (pendingDelete) window.clearTimeout(pendingDelete.timeout)
    },
    [pendingDelete],
  )

  const queueDelete = (entry: ContextEvent) => {
    if (pendingDelete) {
      window.clearTimeout(pendingDelete.timeout)
      setPendingDelete(null)
    }
    const labelSet = entry.event_type.key === SIMPLE_FOOD_FULLNESS_KEY ? fullnessLabels : symptomLabels
    const timeout = window.setTimeout(async () => {
      try {
        await voidContextEvent(entry.id)
        await onRefresh()
      } finally {
        setPendingDelete(null)
      }
    }, 5000)
    setPendingDelete({
      id: entry.id,
      label: `${entry.event_type.display_name.replace(/^Simple Food ·\s*/, '')}: ${labelSet[Number(entry.intensity ?? 0)]}`,
      timeout,
    })
  }

  return (
    <section class="simple-food-section">
      <header class="simple-food-section-header">
        <div>
          <p class="simple-food-eyebrow">B. Quick digestive check-in</p>
          <h2>One tap saves a timestamped observation</h2>
          <p>
            Fullness, bloating, and reflux stay separate. Reflux symptom type can be added later without
            slowing the tap-to-log flow.
          </p>
        </div>
      </header>
      <div class="simple-food-symptom-grid">
        {fullnessType && (
          <SymptomLoggerCard
            eventType={fullnessType}
            events={events}
            labels={fullnessLabels}
            onRefresh={onRefresh}
            prompt="How physically full does your stomach feel right now?"
          />
        )}
        {bloatingType && (
          <SymptomLoggerCard
            eventType={bloatingType}
            events={events}
            labels={symptomLabels}
            onRefresh={onRefresh}
            prompt="How much abdominal bloating or pressure are you experiencing right now?"
          />
        )}
        {refluxType && (
          <SymptomLoggerCard
            eventType={refluxType}
            events={events}
            labels={symptomLabels}
            onRefresh={onRefresh}
            prompt="How severe are your reflux symptoms right now?"
          />
        )}
      </div>
      {pendingDelete && (
        <div class="simple-food-inline-callout warning">
          <div>
            <strong>Deleting entry in a few seconds</strong>
            <small>{pendingDelete.label}</small>
          </div>
          <button
            class="link-button"
            type="button"
            onClick={() => {
              window.clearTimeout(pendingDelete.timeout)
              setPendingDelete(null)
            }}
          >
            Undo
          </button>
        </div>
      )}
      <div class="simple-food-card">
        <header class="simple-food-card-header compact">
          <div>
            <p class="simple-food-eyebrow">Recent check-ins</p>
            <h3>Timeline</h3>
          </div>
          <span class="simple-food-count">{simpleFoodEvents(events).length} observations</span>
        </header>
        {!visibleEvents.length && <p>No symptom check-ins yet.</p>}
        {!!visibleEvents.length && (
          <div class="simple-food-timeline">
            {visibleEvents.map((event) => {
              const labels =
                event.event_type.key === SIMPLE_FOOD_FULLNESS_KEY ? fullnessLabels : symptomLabels
              const mealContext =
                typeof event.metadata.time_since_last_meal === 'string'
                  ? String(event.metadata.time_since_last_meal).replaceAll('_', ' ')
                  : ''
              const refluxDesignation =
                typeof event.metadata.reflux_designation === 'string'
                  ? String(event.metadata.reflux_designation).replaceAll('_', ' ')
                  : ''
              return (
                <article class="simple-food-timeline-item" key={event.id}>
                  <div class="simple-food-timeline-head">
                    <div>
                      <strong>{event.event_type.display_name.replace(/^Simple Food ·\s*/, '')}</strong>
                      <small>
                        {new Date(event.started_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: event.timezone,
                        })}
                      </small>
                    </div>
                    <strong>{labels[Number(event.intensity ?? 0)]}</strong>
                  </div>
                  {(event.notes || mealContext || refluxDesignation) && (
                    <p class="simple-food-help inline">
                      {mealContext && `Meal timing: ${mealContext}. `}
                      {refluxDesignation && `Reflux type: ${refluxDesignation}. `}
                      {event.notes ?? ''}
                    </p>
                  )}
                  <div class="simple-food-timeline-actions">
                    <button
                      class="link-button"
                      type="button"
                      onClick={() => setEditingId(editingId === event.id ? null : event.id)}
                    >
                      {editingId === event.id ? 'Close editor' : 'Edit'}
                    </button>
                    <button class="link-button danger" type="button" onClick={() => queueDelete(event)}>
                      Delete
                    </button>
                  </div>
                  {editingId === event.id && editing && (
                    <SymptomEntryEditor
                      entry={editing}
                      onCancel={() => setEditingId(null)}
                      onSaved={onRefresh}
                    />
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function DailyTrendCard({
  assessments,
  days,
  template,
}: {
  assessments: Assessment[]
  days: number
  template: QuestionnaireTemplate
}) {
  const cutoff = subDays(new Date(), days - 1)
  const items = completedAssessments(assessments, template.id).filter(
    (entry) => new Date(entry.assessed_at).getTime() >= cutoff.getTime(),
  )
  const questions = template.questions.filter((question) => question.enabled)

  return (
    <section class="simple-food-card trend-card">
      <header class="simple-food-card-header compact">
        <div>
          <p class="simple-food-eyebrow">{days}-day view</p>
          <h3>Daily nutrition trends</h3>
        </div>
        <span class="simple-food-count">{items.length} completed days</span>
      </header>
      {!items.length && <p>No daily questionnaires in this window yet.</p>}
      {!!items.length && (
        <div class="simple-food-trend-stack">
          {questions.map((question) => {
            const counts = categoryCount(
              items
                .map((entry) => responseMap(entry, template)[question.stable_key])
                .filter((value): value is string => typeof value === 'string')
                .map((value) => choiceLabel(question, value)),
            )
            const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
            return (
              <div class="simple-food-distribution" key={question.id}>
                <strong>{question.prompt}</strong>
                <small>{total} recorded responses</small>
                <div class="simple-food-distribution-list">
                  {Object.entries(counts).map(([label, count]) => (
                    <div class="simple-food-distribution-row" key={label}>
                      <span>{label}</span>
                      <div class="simple-food-bar-track">
                        <div
                          class="simple-food-bar-fill"
                          style={{ width: `${Math.max(8, (count / Math.max(total, 1)) * 100)}%` }}
                        />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SymptomTrendCard({
  days,
  events,
  title,
  typeKey,
}: {
  days: number
  events: ContextEvent[]
  title: string
  typeKey: string
}) {
  const labels = typeKey === SIMPLE_FOOD_FULLNESS_KEY ? fullnessLabels : symptomLabels
  const cutoff = subDays(new Date(), days - 1)
  const filtered = simpleFoodEvents(events)
    .filter(
      (event) => event.event_type.key === typeKey && new Date(event.started_at).getTime() >= cutoff.getTime(),
    )
    .sort((left, right) => left.started_at.localeCompare(right.started_at))
  const counts = categoryCount(filtered.map((event) => labels[Number(event.intensity ?? 0)]))
  const daysWithEntry = new Set(filtered.map((event) => dateKeyInZone(event.started_at, event.timezone))).size

  return (
    <section class="simple-food-card trend-card">
      <header class="simple-food-card-header compact">
        <div>
          <p class="simple-food-eyebrow">{days}-day view</p>
          <h3>{title}</h3>
        </div>
        <span class="simple-food-count">
          {filtered.length} observations · {daysWithEntry} days with reports
        </span>
      </header>
      {!filtered.length && <p>No observations in this window yet.</p>}
      {!!filtered.length && (
        <>
          <div class="simple-food-distribution-list">
            {Object.entries(counts).map(([label, count]) => (
              <div class="simple-food-distribution-row" key={label}>
                <span>{label}</span>
                <div class="simple-food-bar-track">
                  <div
                    class="simple-food-bar-fill alt"
                    style={{ width: `${Math.max(8, (count / filtered.length) * 100)}%` }}
                  />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <div class="simple-food-observation-strip">
            {filtered.slice(-18).map((event) => (
              <span
                class="simple-food-observation-dot"
                key={event.id}
                title={`${new Date(event.started_at).toLocaleString()} · ${labels[Number(event.intensity ?? 0)]}`}
              >
                {Number(event.intensity ?? 0)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function FullnessTimeCard({ events }: { events: ContextEvent[] }) {
  const fullnessEvents = simpleFoodEvents(events).filter(
    (event) => event.event_type.key === SIMPLE_FOOD_FULLNESS_KEY,
  )
  const buckets = categoryCount(
    fullnessEvents.map((event) => symptomTimeBucket(event.started_at, event.timezone)),
  )

  return (
    <section class="simple-food-card trend-card">
      <header class="simple-food-card-header compact">
        <div>
          <p class="simple-food-eyebrow">Time-of-day pattern</p>
          <h3>Fullness by time of day</h3>
        </div>
        <span class="simple-food-count">{fullnessEvents.length} observations</span>
      </header>
      {!fullnessEvents.length && <p>No fullness check-ins yet.</p>}
      {!!fullnessEvents.length && (
        <div class="simple-food-distribution-list">
          {Object.entries(buckets).map(([label, count]) => (
            <div class="simple-food-distribution-row" key={label}>
              <span>{label}</span>
              <div class="simple-food-bar-track">
                <div
                  class="simple-food-bar-fill"
                  style={{ width: `${Math.max(8, (count / fullnessEvents.length) * 100)}%` }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function TrendsAndAssessments({
  assessments,
  events,
  templates,
}: {
  assessments: Assessment[]
  events: ContextEvent[]
  templates: QuestionnaireTemplate[]
}) {
  const dailyTemplate = questionnaireByKey(templates, SIMPLE_FOOD_DAILY_KEY)
  const reapsTemplate = questionnaireByKey(templates, SIMPLE_FOOD_REAPS_KEY)
  const latestReaps = latestAssessmentForTemplate(assessments, reapsTemplate?.id)
  const latestScores = scoreReapsAssessment(latestReaps, reapsTemplate)

  return (
    <section class="simple-food-section">
      <header class="simple-food-section-header">
        <div>
          <p class="simple-food-eyebrow">C. Trends and assessments</p>
          <h2>Useful summaries, not fake precision</h2>
          <p>
            Counts always show how much data exists. Symptom-free reports stay distinct from days with no
            reports.
          </p>
        </div>
      </header>
      <div class="simple-food-trend-grid">
        {dailyTemplate && <DailyTrendCard assessments={assessments} days={7} template={dailyTemplate} />}
        {dailyTemplate && <DailyTrendCard assessments={assessments} days={28} template={dailyTemplate} />}
        <SymptomTrendCard
          days={7}
          events={events}
          title="Bloating severity"
          typeKey={SIMPLE_FOOD_BLOATING_KEY}
        />
        <SymptomTrendCard
          days={28}
          events={events}
          title="Reflux severity"
          typeKey={SIMPLE_FOOD_REFLUX_KEY}
        />
        <FullnessTimeCard events={events} />
        <section class="simple-food-card trend-card">
          <header class="simple-food-card-header compact">
            <div>
              <p class="simple-food-eyebrow">Detailed assessment</p>
              <h3>REAP-S v2 baseline</h3>
            </div>
          </header>
          {!latestScores && <p>No completed REAP-S v2 assessment yet.</p>}
          {latestScores && (
            <div class="simple-food-score-summary">
              <div class="simple-food-score-total">
                <span>Total score</span>
                <strong>{latestScores.total} / 60</strong>
              </div>
              <ul>
                <li>Food sufficiency: {latestScores.sections.food_sufficiency}</li>
                <li>Healthy eating pattern: {latestScores.sections.healthy_pattern}</li>
                <li>Low nutrient density foods: {latestScores.sections.low_nutrient_density}</li>
                <li>Exercise: {latestScores.sections.exercise}</li>
                {latestScores.readiness && <li>Readiness to change: {latestScores.readiness}</li>}
              </ul>
            </div>
          )}
          <div class="simple-food-link-list">
            <a
              href={`/chart?source_type=metric&pattern=${simpleFoodMetricNames.reflux}&chart_type=line&lookback_days=90`}
            >
              Open reflux in Chart
            </a>
            <a
              href={`/chart?source_type=metric&pattern=${simpleFoodMetricNames.bloating}&chart_type=line&lookback_days=90`}
            >
              Open bloating in Chart
            </a>
            <a
              href={`/chart?source_type=metric&pattern=${simpleFoodMetricNames.produce_frequency}&chart_type=bar&lookback_days=90`}
            >
              Open daily nutrition metrics in Chart
            </a>
          </div>
        </section>
      </div>
    </section>
  )
}

function ReapsSummary({ assessment, template }: { assessment: Assessment; template: QuestionnaireTemplate }) {
  const scores = scoreReapsAssessment(assessment, template)
  if (!scores) return null
  return (
    <div class="simple-food-score-summary compact">
      <div class="simple-food-score-total">
        <span>Total</span>
        <strong>{scores.total} / 60</strong>
      </div>
      <ul>
        <li>
          Food sufficiency: {scores.sections.food_sufficiency} —{' '}
          {sectionVerdict('food_sufficiency', scores.sections.food_sufficiency)}
        </li>
        <li>
          Healthy pattern: {scores.sections.healthy_pattern} —{' '}
          {sectionVerdict('healthy_pattern', scores.sections.healthy_pattern)}
        </li>
        <li>
          Low nutrient density foods: {scores.sections.low_nutrient_density} —{' '}
          {sectionVerdict('low_nutrient_density', scores.sections.low_nutrient_density)}
        </li>
        <li>
          Exercise: {scores.sections.exercise} — {sectionVerdict('exercise', scores.sections.exercise)}
        </li>
        {scores.readiness && <li>Readiness to change: {scores.readiness}</li>}
      </ul>
    </div>
  )
}

// eslint-disable-next-line complexity -- the page coordinates setup resources, daily forms, symptom streams, and two assessment views
export function SimpleFood() {
  const { query, route } = useLocation()
  const isLoggedIn = Boolean(auth.value.token)
  const view = viewForQuery(query.view)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const setup = useQuery({
    queryKey: ['simple-food-setup'],
    queryFn: ensureSimpleFoodResources,
    enabled: isLoggedIn,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const assessments = useQuery({
    queryKey: ['simple-food-assessments'],
    queryFn: () =>
      fetchAssessments({
        start: subDays(new Date(), 400).toISOString(),
        end: addDays(new Date(), 2).toISOString(),
        limit: 1000,
      }),
    enabled: isLoggedIn && setup.isSuccess,
  })
  const contextEvents = useQuery({
    queryKey: ['simple-food-context-events'],
    queryFn: () =>
      fetchContextEvents({
        start: subDays(new Date(), 180).toISOString(),
        end: addDays(new Date(), 2).toISOString(),
        limit: 1000,
      }),
    enabled: isLoggedIn && setup.isSuccess,
  })
  const refresh = async () => {
    await Promise.all([assessments.refetch(), contextEvents.refetch()])
  }

  if (!isLoggedIn) {
    return (
      <div class="simple-food-page simple-food-message-page">
        <h1>Simple Food Tracker</h1>
        <p>Please log in to view your nutrition and digestive tracking.</p>
      </div>
    )
  }

  if (setup.isLoading || assessments.isLoading || contextEvents.isLoading) {
    return (
      <div class="simple-food-page simple-food-message-page">
        <h1>Simple Food Tracker</h1>
        <p>Loading tracker…</p>
      </div>
    )
  }

  if (setup.isError || assessments.isError || contextEvents.isError || !setup.data) {
    const error = setup.error ?? assessments.error ?? contextEvents.error
    return (
      <div class="simple-food-page simple-food-message-page">
        <h1>Simple Food Tracker</h1>
        <p class="simple-food-error">
          {pharmacologyErrorMessage(error, 'Could not load Simple Food Tracker.')}
        </p>
      </div>
    )
  }

  const templates = setup.data.templates
  const dailyTemplate = questionnaireByKey(templates, SIMPLE_FOOD_DAILY_KEY)
  const reapsTemplate = questionnaireByKey(templates, SIMPLE_FOOD_REAPS_KEY)
  const intakeTemplate = questionnaireByKey(templates, SIMPLE_FOOD_INTAKE_KEY)

  return (
    <div class="simple-food-page">
      <header class="simple-food-page-header">
        <div>
          <p class="simple-food-eyebrow">Simple Food Tracker</p>
          <h1>Low-friction nutrition and digestive tracking</h1>
          <p>
            Designed for consistent self-observation without calorie counting, food search, or meal-by-meal
            reconstruction.
          </p>
        </div>
        <p class="simple-food-disclaimer">Observational tracking, not diagnosis or medical advice</p>
      </header>
      <nav class="simple-food-tabs" aria-label="Simple food views">
        {simpleFoodViews.map((item) => (
          <a
            aria-current={view === item.key ? 'page' : undefined}
            class={view === item.key ? 'active' : ''}
            href={simpleFoodUrl(query, { view: item.key })}
            key={item.key}
            onClick={(event) => {
              event.preventDefault()
              route((event.currentTarget as HTMLAnchorElement).href.replace(window.location.origin, ''))
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {view === 'today' && dailyTemplate && (
        <>
          <DailyNutritionCard
            assessments={assessments.data ?? []}
            onRefresh={refresh}
            template={dailyTemplate}
            timezone={timezone}
          />
          <DigestiveCheckIn
            contextTypes={setup.data.contextTypes}
            events={contextEvents.data ?? []}
            onRefresh={refresh}
          />
          <TrendsAndAssessments
            assessments={assessments.data ?? []}
            events={contextEvents.data ?? []}
            templates={templates}
          />
        </>
      )}

      {view === 'assessment' && reapsTemplate && (
        <AssessmentEditor
          assessments={assessments.data ?? []}
          template={reapsTemplate}
          timezone={timezone}
          title="Rapid Eating Assessment for Participants, Short Version, v.2"
          intro={
            <>
              <p>
                This is the complete published REAP-S v2 dietary screener, intended for a more rigorous
                baseline than the daily check. It is best used once now and then repeated manually every 8–12
                weeks when useful.
              </p>
              <p>
                Scoring and cut points follow the published supplemental scoring guidance: total score out of
                60 plus food sufficiency, healthy eating pattern, low nutrient density foods, exercise, and
                readiness-to-change interpretation.
              </p>
            </>
          }
          historySummary={(assessment) => <ReapsSummary assessment={assessment} template={reapsTemplate} />}
          onRefresh={refresh}
        />
      )}

      {view === 'intake' && intakeTemplate && (
        <AssessmentEditor
          assessments={assessments.data ?? []}
          template={intakeTemplate}
          timezone={timezone}
          title="Nutrition & GI intake"
          intro={
            <>
              <p>
                A structured, clinically informed intake covering dietary background, digestive health, health
                context, and eating patterns. This is optional and independent from the fast daily tracker.
              </p>
              <p>
                When relevant information already exists elsewhere in Aurboda, reference it here rather than
                retyping everything from scratch. Nothing in this intake is treated as a diagnosis.
              </p>
            </>
          }
          onRefresh={refresh}
        />
      )}
    </div>
  )
}
