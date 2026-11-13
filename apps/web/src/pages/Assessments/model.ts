import type {
  Assessment,
  CreateQuestionnaireBody,
  QuestionnaireTemplate,
  SubmitAssessmentBody,
} from '@aurboda/api-spec'

import { catalog_version, type Instrument, type ScoreField } from './catalog'

export const localTimestamp = (date = new Date()): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
export const takenTimestamp = (value: string): string => {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime()) || localTimestamp(date) !== value) {
    throw new Error('Enter a valid local date and time.')
  }
  return date.toISOString()
}
export const parseScore = (field: ScoreField, input: string): number | undefined => {
  if (!input.trim()) {
    if (field.required) throw new Error(`${field.label} is required.`)
    return undefined
  }
  const value = Number(input)
  if (!Number.isFinite(value) || value < field.min || value > field.max) {
    throw new Error(`${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`)
  }
  const steps = (value - field.min) / field.step
  if (Math.abs(steps - Math.round(steps)) > 0.00001) {
    throw new Error(`${field.label} must use increments of ${field.step}.`)
  }
  return value
}
const textFields = (instrument: Instrument) => [
  { key: 'provenance', label: 'Instrument provenance', required: false },
  { key: 'device', label: 'Device and browser', required: false },
  { key: 'conditions', label: 'Conditions / first or repeat attempt', required: false },
  {
    key: 'report',
    label: instrument.descriptive_result
      ? 'Exact returned result'
      : instrument.research
        ? 'Score unit or descriptive result and report details'
        : 'Additional subscales, report notes or URL',
    required: !!(instrument.research || instrument.descriptive_result),
  },
  ...(instrument.research
    ? [{ key: 'study', label: 'Exact study/test name and protocol', required: true }]
    : []),
]
export const editableTextFields = (instrument: Instrument) =>
  textFields(instrument).filter((field) => field.key !== 'provenance')
export const templateBody = (instrument: Instrument): CreateQuestionnaireBody => ({
  stable_key: instrument.key,
  display_name: instrument.title,
  description: instrument.version,
  enabled: true,
  moment: 'custom',
  questions: [
    ...instrument.fields.map((field, sort_order) => ({
      stable_key: field.key,
      prompt: field.label,
      response_type: 'numeric' as const,
      required: field.required,
      enabled: true,
      sort_order,
      metric_name: field.metric_name,
      unit: field.unit,
      anchors: {},
      config: { min: field.min, max: field.max, step: field.step },
    })),
    ...textFields(instrument).map((field, index) => ({
      stable_key: field.key,
      prompt: field.label,
      response_type: 'long_text' as const,
      required: field.required,
      enabled: true,
      sort_order: instrument.fields.length + index,
      metric_name: null,
      unit: null,
      anchors: {},
      config: {},
    })),
  ],
})
export const entryValues = (
  instrument: Instrument,
  values: Record<string, string>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const field of instrument.fields) {
    const value = parseScore(field, values[field.key] ?? '')
    if (value !== undefined) result[field.key] = value
  }
  for (const field of editableTextFields(instrument)) {
    const value = values[field.key]?.trim() ?? ''
    if (field.required && !value) throw new Error(`${field.label} is required.`)
    if (value) result[field.key] = value
  }
  result.provenance = JSON.stringify({
    provider: instrument.provider,
    instrument: instrument.title,
    version: instrument.version,
    source_url: instrument.source,
    test_url: instrument.url,
    catalog_version,
    score_fields: instrument.fields,
  })
  return result
}
export const assessmentBody = (
  template: QuestionnaireTemplate,
  values: Record<string, unknown>,
  assessed_at: string,
  timezone: string,
): SubmitAssessmentBody => ({
  template_id: template.id,
  assessed_at,
  timezone,
  responses: Object.entries(values).map(([key, value]) => {
    const question = template.questions.find((candidate) => candidate.stable_key === key && candidate.enabled)
    if (!question) {
      throw new Error('The saved questionnaire differs from this catalog. Your entry has not been saved.')
    }
    return { question_id: question.id, question_version: question.version, value }
  }),
})
const checkedTemplate = (instrument: Instrument, template: QuestionnaireTemplate): QuestionnaireTemplate => {
  const expected = templateBody(instrument).questions
  const changed = expected.some((field) => {
    const actual = template.questions.find((question) => question.stable_key === field.stable_key)
    return (
      !actual ||
      !actual.enabled ||
      actual.response_type !== field.response_type ||
      actual.required !== field.required ||
      (actual.unit ?? null) !== (field.unit ?? null) ||
      (actual.metric_name ?? null) !== (field.metric_name ?? null) ||
      ['min', 'max', 'step'].some((key) => actual.config[key] !== field.config[key])
    )
  })
  const extraRequired = template.questions.some(
    (question) =>
      question.enabled &&
      question.required &&
      !expected.some((field) => field.stable_key === question.stable_key),
  )
  if (!template.enabled || changed || extraRequired) {
    throw new Error(
      'The saved test definition has changed. Restore its original score fields in Treatments → Library before recording this test. Your entry has not been saved.',
    )
  }
  return template
}
export const ensureTemplate = async (
  instrument: Instrument,
  api: {
    list: () => Promise<QuestionnaireTemplate[]>
    create: (body: CreateQuestionnaireBody) => Promise<QuestionnaireTemplate>
  },
): Promise<QuestionnaireTemplate> => {
  const existing = (await api.list()).find((template) => template.stable_key === instrument.key)
  if (existing) return checkedTemplate(instrument, existing)
  try {
    return checkedTemplate(instrument, await api.create(templateBody(instrument)))
  } catch (error) {
    const raced = (await api.list()).find((template) => template.stable_key === instrument.key)
    if (raced) return checkedTemplate(instrument, raced)
    throw error
  }
}
export const historyFor = (assessments: Assessment[], template?: QuestionnaireTemplate): Assessment[] =>
  template
    ? assessments
        .filter((entry) => entry.template_id === template.id && !entry.deleted_at)
        .sort(
          (a, b) => b.assessed_at.localeCompare(a.assessed_at) || b.created_at.localeCompare(a.created_at),
        )
    : []
