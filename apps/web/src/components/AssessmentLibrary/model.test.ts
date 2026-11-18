import {
  assessmentInstruments,
  instrumentScore,
  type Assessment,
  type QuestionnaireTemplate,
} from '@aurboda/api-spec'
import { expect, test } from 'vitest'

import { recordedEntryText } from './model'
const template = (index: number): QuestionnaireTemplate => ({
  ...assessmentInstruments[index].definition,
  id: 'template',
  version: 1,
  created_at: '2026-11-18T12:00:00Z',
  updated_at: '2026-11-18T12:00:00Z',
  questions: assessmentInstruments[index].definition.questions.map((q, i) => ({
    ...q,
    id: `question-${i}`,
    version: 1,
  })),
})
const assessment = (t: QuestionnaireTemplate, values: unknown[]): Assessment => ({
  id: 'entry',
  template_id: t.id,
  template_version: 1,
  assessed_at: '2026-11-17T12:00:00Z',
  created_at: '2026-11-18T12:00:00Z',
  updated_at: '2026-11-18T12:00:00Z',
  timezone: 'UTC',
  responses: values.map((value, i) => ({ question_id: t.questions[i].id, question_version: 1, value })),
})
test('GAD sums seven items and excludes difficulty, incomplete answers never become zero', () => {
  const t = template(0)
  expect(instrumentScore(t, assessment(t, ['3', '3', '3', '3', '3', '3', '3', 'Extremely difficult']))).toBe(
    21,
  )
  expect(instrumentScore(t, assessment(t, ['0', '0', '0', '0', '0', '0', '0']))).toBe(0)
  expect(instrumentScore(t, assessment(t, ['0', '0', '0', '0', '0', '0']))).toBeNull()
  expect(
    instrumentScore(t, { ...assessment(t, ['0', '0', '0', '0', '0', '0', '0']), template_version: 2 }),
  ).toBeNull()
})
test('PEG averages rather than sums and retains observation and recording dates in selected notes', () => {
  const t = template(1)
  const entry = assessment(t, [2, 4, 6])
  expect(instrumentScore(t, entry)).toBe(4)
  expect(instrumentScore(t, { ...entry, stage: 'draft' })).toBeNull()
  expect(instrumentScore(t, assessment(t, [2, 4, null]))).toBeNull()
  expect(recordedEntryText(entry, t)).toContain('Observed: 2026-11-17')
  expect(recordedEntryText(entry, t)).toContain('recorded: 2026-11-18')
  expect(recordedEntryText(entry, t)).toContain('Past week')
  expect(recordedEntryText({ ...entry, template_version: 9 }, t)).toContain(
    'Historical recall instructions unavailable',
  )
})
test('custom identity or edited wording cannot produce official scoring', () => {
  const t = template(1)
  const entry = assessment(t, [2, 4, 6])
  expect(instrumentScore({ ...t, stable_key: 'custom_copy' }, entry)).toBeNull()
  expect(
    instrumentScore({ ...t, questions: t.questions.map((q) => ({ ...q, prompt: 'Changed' })) }, entry),
  ).toBeNull()
})
