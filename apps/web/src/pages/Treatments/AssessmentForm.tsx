import type { Assessment, AssessmentQuestion, QuestionnaireTemplate } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { pharmacologyErrorMessage, submitAssessment } from '../../state/api'
import { localDateTimeToIso, nowLocalDateTime } from './model'
import { configuredChoices } from './questionnaire-choices'

type AnswerMap = Record<string, unknown>

export const answered = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)

function ChoiceButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: preact.ComponentChildren
  onClick: () => void
}) {
  return (
    <button
      class={active ? 'segment active' : 'segment'}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// eslint-disable-next-line complexity -- dynamic questionnaire renderer supports every configured response type
export function QuestionField({
  onChange,
  question,
  value,
}: {
  onChange: (value: unknown) => void
  question: AssessmentQuestion
  value: unknown
}) {
  const choices = configuredChoices(question)
  const anchors = question.anchors as Record<string, unknown>
  switch (question.response_type) {
    case 'likert': {
      const min = typeof question.config.min === 'number' ? question.config.min : 1
      const max = typeof question.config.max === 'number' ? question.config.max : 5
      const values = Array.from({ length: max - min + 1 }, (_, index) => index + min)
      return (
        <>
          <div class="segments likert-segments">
            {values.map((number) => (
              <ChoiceButton active={value === number} key={number} onClick={() => onChange(number)}>
                {number}
              </ChoiceButton>
            ))}
          </div>
          <div class="anchor-labels">
            <span>{String(anchors[String(min)] ?? anchors.min ?? '')}</span>
            <span>{String(anchors[String(max)] ?? anchors.max ?? '')}</span>
          </div>
        </>
      )
    }
    case 'numeric':
      return (
        <input
          type="number"
          step={typeof question.config.step === 'number' ? question.config.step : 'any'}
          min={typeof question.config.min === 'number' ? question.config.min : undefined}
          max={typeof question.config.max === 'number' ? question.config.max : undefined}
          value={typeof value === 'number' ? value : ''}
          onInput={(event) => {
            const next = (event.target as HTMLInputElement).value
            onChange(next === '' ? undefined : Number(next))
          }}
        />
      )
    case 'yes_no':
      return (
        <div class="segments">
          <ChoiceButton active={value === true} onClick={() => onChange(true)}>
            Yes
          </ChoiceButton>
          <ChoiceButton active={value === false} onClick={() => onChange(false)}>
            No
          </ChoiceButton>
        </div>
      )
    case 'single_choice':
      return (
        <div class="choice-chips">
          {choices.map((choice) => (
            <ChoiceButton
              active={value === choice.value}
              key={choice.value}
              onClick={() => onChange(choice.value)}
            >
              {choice.label}
              {choice.detail && (
                <>
                  <br />
                  <small>{choice.detail}</small>
                </>
              )}
            </ChoiceButton>
          ))}
        </div>
      )
    case 'multiple_choice': {
      const selected = Array.isArray(value) ? (value as unknown[]) : []
      return (
        <div class="choice-chips">
          {choices.map((choice) => (
            <ChoiceButton
              active={selected.includes(choice.value)}
              key={choice.value}
              onClick={() =>
                onChange(
                  selected.includes(choice.value)
                    ? selected.filter((item) => item !== choice.value)
                    : [...selected, choice.value],
                )
              }
            >
              {choice.label}
              {choice.detail && (
                <>
                  <br />
                  <small>{choice.detail}</small>
                </>
              )}
            </ChoiceButton>
          ))}
        </div>
      )
    }
    case 'short_text':
      return (
        <input
          value={typeof value === 'string' ? value : ''}
          onInput={(event) => onChange((event.target as HTMLInputElement).value)}
        />
      )
    case 'long_text':
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)}
        />
      )
    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onInput={(event) => onChange((event.target as HTMLInputElement).value)}
        />
      )
    case 'tags':
      return (
        <input
          placeholder="Separate tags with commas"
          value={Array.isArray(value) ? value.join(', ') : ''}
          onInput={(event) =>
            onChange(
              (event.target as HTMLInputElement).value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            )
          }
        />
      )
  }
}

export function AssessmentForm({
  date,
  onCancel,
  onSaved,
  stage,
  template,
  timezone,
  treatmentSessionId,
}: {
  date?: string
  onCancel: () => void
  onSaved: (assessment: Assessment) => void
  stage?: string
  template: QuestionnaireTemplate
  timezone: string
  treatmentSessionId?: string
}) {
  const needsActualTime =
    date !== undefined &&
    date !==
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [assessedLocal, setAssessedLocal] = useState(() => (needsActualTime ? '' : nowLocalDateTime()))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const questions = template.questions
    .filter((question) => question.enabled)
    .sort((a, b) => a.sort_order - b.sort_order)
  const mutation = useMutation({
    mutationFn: () => {
      const missing = questions.find((question) => question.required && !answered(answers[question.id]))
      if (missing) throw new Error(`Answer “${missing.prompt}”.`)
      const responses = questions
        .filter((question) => answered(answers[question.id]))
        .map((question) => ({
          question_id: question.id,
          question_version: question.version,
          value:
            question.response_type === 'datetime'
              ? localDateTimeToIso(answers[question.id] as string)
              : answers[question.id],
        }))
      if (responses.length === 0) throw new Error('Answer at least one question.')
      return submitAssessment({
        assessed_at: localDateTimeToIso(assessedLocal),
        notes: notes || undefined,
        responses,
        stage,
        template_id: template.id,
        timezone,
        ...(treatmentSessionId && { treatment_session_id: treatmentSessionId }),
      })
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: onSaved,
  })

  return (
    <form
      class="treatments-form assessment-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!mutation.isPending) mutation.mutate()
      }}
    >
      <div class="form-heading">
        <div>
          <p class="treatments-kicker">Check-in</p>
          <h2>{template.display_name}</h2>
        </div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close assessment">
          ×
        </button>
      </div>
      {template.description && <p>{template.description}</p>}
      {needsActualTime && (
        <p class="form-hint">
          Enter the actual date and time for this entry. No time has been filled in for you.
        </p>
      )}
      <label class="field full-field assessed-at-field">
        <span>Assessed at</span>
        <input
          required
          type="datetime-local"
          value={assessedLocal}
          onInput={(event) => setAssessedLocal((event.target as HTMLInputElement).value)}
        />
      </label>
      {questions.map((question) => (
        <fieldset class="question-field" key={question.id}>
          <legend>
            {question.prompt} {!question.required && <span class="optional-label">Optional</span>}
          </legend>
          {typeof (question.config.description ?? question.config.helper) === 'string' && (
            <p class="form-hint">{String(question.config.description ?? question.config.helper)}</p>
          )}
          <QuestionField
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        </fieldset>
      ))}
      <details class="advanced-fields">
        <summary>Add a note</summary>
        <label class="field full-field">
          <span>Note</span>
          <textarea
            value={notes}
            onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
          />
        </label>
      </details>
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
          {mutation.isPending ? 'Saving…' : 'Save check-in'}
        </button>
      </div>
    </form>
  )
}
