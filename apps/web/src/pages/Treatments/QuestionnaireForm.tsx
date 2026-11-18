import type { AssessmentQuestion, QuestionnaireTemplate } from '@aurboda/api-spec'

import { isManagedInstrumentKey } from '@aurboda/api-spec'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { createQuestionnaire, pharmacologyErrorMessage, updateQuestionnaire } from '../../state/api'
import { QuestionField } from './AssessmentForm'
import { configuredChoices, hasStructuredChoices } from './questionnaire-choices'

type ResponseType = AssessmentQuestion['response_type']

interface QuestionDraft {
  id?: string
  version?: number
  stableKey: string
  prompt: string
  responseType: ResponseType
  required: boolean
  enabled: boolean
  metricName: string
  unit: string
  min: string
  max: string
  step: string
  minAnchor: string
  maxAnchor: string
  choices: string
  originalConfig: AssessmentQuestion['config']
  originalAnchors: AssessmentQuestion['anchors']
  originalResponseType?: ResponseType
}

// eslint-disable-next-line complexity -- every optional persisted question field needs an independent fallback
const questionDraft = (question?: AssessmentQuestion): QuestionDraft => ({
  choices: configuredChoices(question)
    .map((choice) => choice.label)
    .join(', '),
  originalConfig: question?.config ?? {},
  originalAnchors: question?.anchors ?? {},
  originalResponseType: question?.response_type,
  enabled: question?.enabled ?? true,
  id: question?.id,
  max: String(typeof question?.config.max === 'number' ? question.config.max : 5),
  maxAnchor: String(question?.anchors.max ?? ''),
  metricName: question?.metric_name ?? '',
  min: String(typeof question?.config.min === 'number' ? question.config.min : 1),
  minAnchor: String(question?.anchors.min ?? ''),
  prompt: question?.prompt ?? '',
  required: question?.required ?? false,
  responseType: question?.response_type ?? 'likert',
  stableKey: question?.stable_key ?? '',
  step: String(typeof question?.config.step === 'number' ? question.config.step : 1),
  unit: question?.unit ?? 'score',
  version: question?.version,
})

const responseOptions: Array<{ label: string; value: ResponseType }> = [
  { label: '1–5 / Likert scale', value: 'likert' },
  { label: 'Numeric', value: 'numeric' },
  { label: 'Yes / no', value: 'yes_no' },
  { label: 'Single choice', value: 'single_choice' },
  { label: 'Multiple choice', value: 'multiple_choice' },
  { label: 'Short text', value: 'short_text' },
  { label: 'Long text', value: 'long_text' },
  { label: 'Date and time', value: 'datetime' },
  { label: 'Tags', value: 'tags' },
]

const numericType = (type: ResponseType) => type === 'likert' || type === 'numeric'
const choiceType = (type: ResponseType) => type === 'single_choice' || type === 'multiple_choice'

// eslint-disable-next-line complexity -- response types carry different validated configuration shapes
const buildQuestionInput = (question: QuestionDraft, sortOrder: number) => {
  const key = question.stableKey.trim()
  const prompt = question.prompt.trim()
  if (!key || !prompt) throw new Error(`Complete question ${sortOrder + 1}.`)
  const min = Number(question.min)
  const max = Number(question.max)
  const step = Number(question.step)
  if (numericType(question.responseType) && (!Number.isFinite(min) || !Number.isFinite(max) || min >= max)) {
    throw new Error(`Question ${sortOrder + 1} needs a valid minimum and maximum.`)
  }
  if (numericType(question.responseType) && (!Number.isFinite(step) || step <= 0)) {
    throw new Error(`Question ${sortOrder + 1} needs a positive step.`)
  }
  if (
    question.responseType === 'likert' &&
    (!Number.isInteger(min) || !Number.isInteger(max) || max - min > 20)
  ) {
    throw new Error('Use a whole-number scale with at most 21 choices, or choose Numeric.')
  }
  const structuredChoices = hasStructuredChoices(question.originalConfig)
  const choices = structuredChoices
    ? configuredChoices({ config: question.originalConfig }).map((choice) => choice.value)
    : question.choices
        .split(',')
        .map((choice) => choice.trim())
        .filter(Boolean)
  if (choiceType(question.responseType) && choices.length < 2) {
    throw new Error(`Question ${sortOrder + 1} needs at least two choices.`)
  }
  return {
    ...(question.id && { id: question.id }),
    ...(question.version && { version: question.version }),
    anchors: numericType(question.responseType)
      ? { ...question.originalAnchors, max: question.maxAnchor.trim(), min: question.minAnchor.trim() }
      : question.originalAnchors,
    config: numericType(question.responseType)
      ? { ...question.originalConfig, max, min, ...(Number.isFinite(step) && step > 0 && { step }) }
      : choiceType(question.responseType)
        ? structuredChoices
          ? question.originalConfig
          : {
              ...question.originalConfig,
              [question.originalConfig.choices === undefined && question.originalConfig.options !== undefined
                ? 'options'
                : 'choices']: choices,
            }
        : question.originalResponseType === question.responseType
          ? question.originalConfig
          : {},
    enabled: question.enabled,
    metric_name: question.metricName.trim() || null,
    prompt,
    required: question.required,
    response_type: question.responseType,
    sort_order: sortOrder,
    stable_key: key,
    unit: question.unit.trim() || null,
  }
}

// eslint-disable-next-line complexity -- shared editor preserves advanced fields while supporting simple creation and a renderer-backed preview
export function QuestionnaireForm({
  onCancel,
  onSaved,
  template,
  simple = false,
}: {
  simple?: boolean
  onCancel: () => void
  onSaved: (message: string) => void
  template?: QuestionnaireTemplate
}) {
  const [displayName, setDisplayName] = useState(template?.display_name ?? '')
  const [stableKey, setStableKey] = useState(
    template?.stable_key ?? (simple ? `custom_${crypto.randomUUID().replaceAll('-', '')}` : ''),
  )
  const [domain, setDomain] = useState<'mental' | 'physical' | 'general'>(
    template?.library?.domain ?? 'general',
  )
  const [recall, setRecall] = useState(template?.library?.recall_period ?? 'How you feel when answering')
  const [effort, setEffort] = useState(template?.library?.estimated_minutes ?? 2)
  const [description, setDescription] = useState(template?.description ?? '')
  const [moment, setMoment] = useState<QuestionnaireTemplate['moment']>(template?.moment ?? 'custom')
  const [enabled, setEnabled] = useState(template?.enabled ?? true)
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    () =>
      template?.questions
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(questionDraft) ?? [
        { ...questionDraft(), stableKey: simple ? `q_${crypto.randomUUID().replaceAll('-', '')}` : '' },
      ],
  )
  const [previewQuestions, setPreviewQuestions] = useState<AssessmentQuestion[]>([])
  const [preview, setPreview] = useState(false)
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({})
  const moveQuestion = (index: number, direction: number) =>
    setQuestions((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  const [error, setError] = useState('')
  const updateQuestion = (index: number, updates: Partial<QuestionDraft>) =>
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...updates } : question,
      ),
    )
  const mutation = useMutation({
    mutationFn: () => {
      if (questions.length === 0) throw new Error('Add at least one question.')
      const bodyQuestions = questions.map(buildQuestionInput)
      const body = {
        description: description.trim() || null,
        library: { domain, recall_period: recall.trim(), estimated_minutes: effort },
        display_name: displayName.trim(),
        enabled,
        moment,
        questions: bodyQuestions,
        stable_key: stableKey.trim(),
      }
      if (!body.display_name || !body.stable_key) throw new Error('Enter a name and stable key.')
      return template ? updateQuestionnaire(template.id, body) : createQuestionnaire(body)
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: () => onSaved(template ? 'Questionnaire updated.' : 'Questionnaire created.'),
  })

  if (template && isManagedInstrumentKey(template.stable_key)) {
    return (
      <section>
        <h2>Standardized instrument</h2>
        <p>
          This definition is read-only. Use the shared assessment library to make a custom copy without
          official scoring.
        </p>
        <a href={template.library?.domain === 'physical' ? '/physical-assessments' : '/assessments'}>
          Open library
        </a>
        <button onClick={onCancel}>Close</button>
      </section>
    )
  }
  return (
    <form
      class="treatments-form wide-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!mutation.isPending) mutation.mutate()
      }}
    >
      <div class="form-heading">
        <div>
          <p class="treatments-kicker">Assessment builder</p>
          <h2>{template ? 'Edit questionnaire' : 'New questionnaire'}</h2>
        </div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close questionnaire form">
          ×
        </button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Name</span>
          <input
            required
            value={displayName}
            onInput={(event) => setDisplayName((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" hidden={simple}>
          <span>Stable key</span>
          <input
            required
            pattern="[a-z][a-z0-9_]*"
            value={stableKey}
            onInput={(event) => setStableKey((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" hidden={simple}>
          <span>When</span>
          <select
            value={moment}
            onChange={(event) =>
              setMoment((event.target as HTMLSelectElement).value as QuestionnaireTemplate['moment'])
            }
          >
            <option value="morning">Morning</option>
            <option value="midday">Midday</option>
            <option value="evening">Evening</option>
            <option value="pre_treatment">Pre-treatment</option>
            <option value="post_treatment">Post-treatment</option>
            <option value="follow_up">Follow-up</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label class="check-label field-checkbox">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled((event.target as HTMLInputElement).checked)}
          />
          Enabled
        </label>
        <label class="field full-field">
          <span>Description</span>
          <textarea
            value={description}
            onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)}
          />
        </label>
      </div>
      <div class="form-grid">
        <label class="field">
          Library category
          <select value={domain} onChange={(e) => setDomain(e.currentTarget.value as typeof domain)}>
            <option value="general">General</option>
            <option value="mental">Mental well-being</option>
            <option value="physical">Physical health and function</option>
          </select>
        </label>
        <label class="field">
          Recall period
          <input required maxLength={300} value={recall} onInput={(e) => setRecall(e.currentTarget.value)} />
        </label>
        <label class="field">
          Estimated minutes
          <input
            type="number"
            required
            min={1}
            max={120}
            value={effort}
            onInput={(e) => setEffort(Number(e.currentTarget.value))}
          />
        </label>
      </div>
      <p class="form-hint">
        Custom questionnaire · not a validated instrument. Choose questions that help you notice something
        useful. No total score is calculated.
      </p>
      <button
        class="btn-secondary"
        type="button"
        onClick={() => {
          if (preview) {
            setPreview(false)
            return
          }
          try {
            setPreviewQuestions(
              questions.map((q, i) => ({
                ...buildQuestionInput(q, i),
                id: q.id ?? q.stableKey,
                version: q.version ?? 1,
              })),
            )
            setError('')
            setPreviewAnswers({})
            setPreview(true)
          } catch (failure) {
            setError(pharmacologyErrorMessage(failure))
          }
        }}
      >
        {preview ? 'Edit questions' : 'Preview questions'}
      </button>
      {preview && (
        <section aria-label="Questionnaire preview">
          <p>Preview only. Answers here are not saved.</p>
          {previewQuestions
            .filter((q) => q.enabled)
            .map((q) => (
              <fieldset class="question-field" key={q.id}>
                <legend>
                  {q.prompt} {q.required ? '(required)' : '(optional)'}
                </legend>
                <QuestionField
                  question={q}
                  value={previewAnswers[q.id]}
                  onChange={(value) => setPreviewAnswers((current) => ({ ...current, [q.id]: value }))}
                />
              </fieldset>
            ))}
        </section>
      )}
      <fieldset class="form-panel">
        <legend>Questions</legend>
        <p class="form-hint">
          Editing a question creates a new immutable version. Existing answers keep their original wording and
          scale.
        </p>
        <div class="builder-items" hidden={preview}>
          {questions.map((question, index) => (
            <div class="builder-item" key={question.stableKey || index}>
              <div class="builder-item-heading">
                <strong>Question {index + 1}</strong>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveQuestion(index, -1)}
                  aria-label={`Move question ${index + 1} up`}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={index === questions.length - 1}
                  onClick={() => moveQuestion(index, 1)}
                  aria-label={`Move question ${index + 1} down`}
                >
                  Move down
                </button>
                <button
                  class="danger-link"
                  type="button"
                  onClick={() =>
                    setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))
                  }
                >
                  Remove
                </button>
              </div>
              <div class="form-grid">
                <label class="field" hidden={simple}>
                  <span>Stable key</span>
                  <input
                    required
                    pattern="[a-z][a-z0-9_]*"
                    value={question.stableKey}
                    onInput={(event) =>
                      updateQuestion(index, { stableKey: (event.target as HTMLInputElement).value })
                    }
                  />
                </label>
                <label class="field">
                  <span>Response type</span>
                  <select
                    value={question.responseType}
                    onChange={(event) =>
                      updateQuestion(index, {
                        responseType: (event.target as HTMLSelectElement).value as ResponseType,
                      })
                    }
                  >
                    {responseOptions.map((option) => (
                      <option value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label class="field full-field">
                  <span>Prompt</span>
                  <input
                    required
                    value={question.prompt}
                    onInput={(event) =>
                      updateQuestion(index, { prompt: (event.target as HTMLInputElement).value })
                    }
                  />
                </label>
                {numericType(question.responseType) && (
                  <>
                    <label class="field">
                      <span>Minimum</span>
                      <input
                        required
                        step="any"
                        type="number"
                        value={question.min}
                        onInput={(event) =>
                          updateQuestion(index, { min: (event.target as HTMLInputElement).value })
                        }
                      />
                    </label>
                    <label class="field">
                      <span>Maximum</span>
                      <input
                        required
                        step="any"
                        type="number"
                        value={question.max}
                        onInput={(event) =>
                          updateQuestion(index, { max: (event.target as HTMLInputElement).value })
                        }
                      />
                    </label>
                    <label class="field">
                      <span>Minimum anchor</span>
                      <input
                        value={question.minAnchor}
                        onInput={(event) =>
                          updateQuestion(index, { minAnchor: (event.target as HTMLInputElement).value })
                        }
                      />
                    </label>
                    <label class="field">
                      <span>Maximum anchor</span>
                      <input
                        value={question.maxAnchor}
                        onInput={(event) =>
                          updateQuestion(index, { maxAnchor: (event.target as HTMLInputElement).value })
                        }
                      />
                    </label>
                  </>
                )}
                {question.responseType === 'numeric' && (
                  <label class="field">
                    <span>Step</span>
                    <input
                      min="0"
                      step="any"
                      type="number"
                      value={question.step}
                      onInput={(event) =>
                        updateQuestion(index, { step: (event.target as HTMLInputElement).value })
                      }
                    />
                  </label>
                )}
                {choiceType(question.responseType) && (
                  <label class="field full-field">
                    <span>
                      {hasStructuredChoices(question.originalConfig)
                        ? 'Predefined choices'
                        : 'Choices (comma-separated)'}
                    </span>
                    <input
                      required
                      readOnly={hasStructuredChoices(question.originalConfig)}
                      value={question.choices}
                      onInput={(event) =>
                        updateQuestion(index, { choices: (event.target as HTMLInputElement).value })
                      }
                    />
                    {hasStructuredChoices(question.originalConfig) && (
                      <small>These predefined choices are kept when you edit this questionnaire.</small>
                    )}
                  </label>
                )}
                <label class="field" hidden={simple}>
                  <span>Analytics metric name</span>
                  <input
                    pattern="[a-z][a-z0-9_]*"
                    placeholder="optional_metric_name"
                    value={question.metricName}
                    onInput={(event) =>
                      updateQuestion(index, { metricName: (event.target as HTMLInputElement).value })
                    }
                  />
                </label>
                <label class="field" hidden={simple}>
                  <span>Unit</span>
                  <input
                    value={question.unit}
                    onInput={(event) =>
                      updateQuestion(index, { unit: (event.target as HTMLInputElement).value })
                    }
                  />
                </label>
              </div>
              <div class="inline-toggles">
                <label class="check-label">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) =>
                      updateQuestion(index, { required: (event.target as HTMLInputElement).checked })
                    }
                  />
                  Required
                </label>
                <label class="check-label">
                  <input
                    type="checkbox"
                    checked={question.enabled}
                    onChange={(event) =>
                      updateQuestion(index, { enabled: (event.target as HTMLInputElement).checked })
                    }
                  />
                  Enabled
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          class="btn-secondary"
          type="button"
          onClick={() => {
            setPreview(false)
            setQuestions((current) => [
              ...current,
              { ...questionDraft(), stableKey: simple ? `q_${crypto.randomUUID().replaceAll('-', '')}` : '' },
            ])
          }}
        >
          Add question
        </button>
      </fieldset>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save questionnaire'}
        </button>
      </div>
    </form>
  )
}
