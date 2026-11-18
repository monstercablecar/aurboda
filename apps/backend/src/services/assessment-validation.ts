import type { AssessmentAnswer, QuestionnaireTemplate } from '@aurboda/api-spec'

import { httpError } from '../http-error.ts'

type CheckinQuestion = QuestionnaireTemplate['questions'][number]
const validateNumber = (q: CheckinQuestion, v: unknown) => {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    (q.response_type === 'likert' && !Number.isInteger(v)) ||
    (typeof q.config.min === 'number' && v < q.config.min) ||
    (typeof q.config.max === 'number' && v > q.config.max) ||
    (typeof q.config.step === 'number' &&
      q.config.step > 0 &&
      Math.abs(
        (v - (typeof q.config.min === 'number' ? q.config.min : 0)) / q.config.step -
          Math.round((v - (typeof q.config.min === 'number' ? q.config.min : 0)) / q.config.step),
      ) > 1e-8)
  ) {
    throw httpError(400, 'Check the numeric answer range.')
  }
}
const validateChoice = (q: CheckinQuestion, v: unknown) => {
  const configured = q.config.choices ?? q.config.options
  const choices = Array.isArray(configured)
    ? configured.map((c) =>
        typeof c === 'string' ? c : c && typeof c === 'object' ? (c as { value?: unknown }).value : undefined,
      )
    : []
  const values = q.response_type === 'single_choice' ? [v] : v
  if (!Array.isArray(values) || !values.length || values.some((value) => !choices.includes(value))) {
    throw httpError(400, 'Choose an available answer.')
  }
}
const validateText = (q: CheckinQuestion, v: unknown) => {
  if (typeof v !== 'string' || v.length > 10000) throw httpError(400, 'Check the text answer.')
  if (q.response_type === 'datetime' && !Number.isFinite(Date.parse(v))) {
    throw httpError(400, 'Choose a valid date and time.')
  }
}
const validateAnswer = (q: CheckinQuestion, v: unknown) => {
  if (v === null || v === undefined || v === '') throw httpError(400, 'Omit unanswered questions.')
  switch (q.response_type) {
    case 'numeric':
    case 'likert':
      return validateNumber(q, v)
    case 'short_text':
    case 'long_text':
    case 'datetime':
      return validateText(q, v)
    case 'single_choice':
    case 'multiple_choice':
      return validateChoice(q, v)
    case 'yes_no':
      if (typeof v !== 'boolean') throw httpError(400, 'Choose yes or no.')
      break
    case 'tags':
      return validateTags(v)
  }
}
const validateTags = (v: unknown) => {
  if (!Array.isArray(v) || v.length > 100 || v.some((t) => typeof t !== 'string' || t.length > 200)) {
    throw httpError(400, 'Check the tags.')
  }
}
export const validateResponses = (
  template: QuestionnaireTemplate,
  responses: AssessmentAnswer[],
  final: boolean,
) => {
  const ids = new Set<string>()
  for (const response of responses) {
    const q = template.questions.find(
      (question) =>
        question.id === response.question_id &&
        question.version === response.question_version &&
        question.enabled,
    )
    if (!q || ids.has(q.id)) throw httpError(400, 'Answers must match the selected questionnaire version.')
    ids.add(q.id)
    validateAnswer(q, response.value)
  }
  if (
    final &&
    (!responses.length || template.questions.some((q) => q.enabled && q.required && !ids.has(q.id)))
  ) {
    throw httpError(400, 'Answer the required questions, or skip this optional check-in.')
  }
}

export const validateQuestionDefinitions = (
  questions: Array<Omit<CheckinQuestion, 'id' | 'version'> & { id?: string; version?: number }>,
) => {
  const keys = new Set<string>()
  const ids = new Set<string>()
  for (const q of questions) {
    if (keys.has(q.stable_key) || (q.id && ids.has(q.id))) {
      throw httpError(400, 'Question identities must be unique.')
    }
    keys.add(q.stable_key)
    if (q.id) ids.add(q.id)
    if (q.response_type === 'numeric' || q.response_type === 'likert') validateNumericDefinition(q)
    if (q.response_type === 'single_choice' || q.response_type === 'multiple_choice') {
      const choices = q.config.choices ?? q.config.options
      if (!Array.isArray(choices) || choices.length < 2) {
        throw httpError(400, 'Provide at least two answer choices.')
      }
      const values = choices.map((c) =>
        typeof c === 'string' ? c : c && typeof c === 'object' ? (c as { value?: unknown }).value : undefined,
      )
      if (values.some((v) => typeof v !== 'string' || !v.trim()) || new Set(values).size !== values.length) {
        throw httpError(400, 'Answer choices must have unique, nonempty values.')
      }
    }
  }
}
const validateNumericDefinition = (q: Omit<CheckinQuestion, 'id' | 'version'>) => {
  const min = q.config.min ?? (q.response_type === 'likert' ? 1 : undefined)
  const max = q.config.max ?? (q.response_type === 'likert' ? 5 : undefined)
  const step = q.config.step
  if ([min, max, step].some((v) => v !== undefined && (typeof v !== 'number' || !Number.isFinite(v)))) {
    throw httpError(400, 'Use finite numeric bounds and step.')
  }
  if (typeof min === 'number' && typeof max === 'number' && min >= max) {
    throw httpError(400, 'Maximum must exceed minimum.')
  }
  if (typeof step === 'number' && step <= 0) throw httpError(400, 'Step must be positive.')
  if (
    q.response_type === 'likert' &&
    (!Number.isInteger(min) || !Number.isInteger(max) || Number(max) - Number(min) > 20)
  ) {
    throw httpError(400, 'Use at most 21 whole-number scale choices, or use a numeric question.')
  }
}
