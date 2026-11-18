import { assessmentInstruments, instrumentScore, updateQuestionnaireBodySchema } from '@aurboda/api-spec'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { reapsDefinition } from '../../../web/src/pages/SimpleFood/model.ts'
import { _setDbForUser, query } from '../db/connection.ts'
import * as db from '../db/pharmacology.ts'
import { createRolePool } from '../db/pool.ts'
import {
  createTestDatabase,
  cleanTestDb,
  getTestUser,
  startTestDb,
  stopTestDb,
} from '../test/db-test-helper.ts'
import {
  createQuestionnaire,
  updateQuestionnaire,
  submitAssessment,
  correctAssessment,
} from './pharmacology.ts'

beforeAll(startTestDb, 120000)
afterAll(stopTestDb, 120000)
beforeEach(cleanTestDb, 120000)
const user = () => getTestUser()
const definition = () => ({
  display_name: 'Personal observation',
  stable_key: 'personal_test',
  moment: 'custom' as const,
  enabled: true,
  library: { domain: 'general' as const, recall_period: 'Today', estimated_minutes: 1 },
  questions: [
    {
      stable_key: 'ability',
      prompt: 'Ability today',
      response_type: 'numeric' as const,
      required: false,
      enabled: true,
      sort_order: 0,
      metric_name: 'ability_test',
      unit: 'score',
      anchors: {},
      config: { min: 0, max: 10, step: 1 },
    },
  ],
})
const body = (template: Awaited<ReturnType<typeof createQuestionnaire>>, value: unknown = 0) => ({
  template_id: template.id,
  template_version: template.version,
  assessed_at: '2026-11-18T12:00:00Z',
  timezone: 'UTC',
  responses: [
    { question_id: template.questions[0].id, question_version: template.questions[0].version, value },
  ],
})

test('old displayed forms and notes corrections retain frozen definitions and projection units', async () => {
  const original = await createQuestionnaire(user(), definition())
  const entry = await db.createAssessment(user(), body(original, 3))
  await updateQuestionnaire(user(), original.id, {
    library: { domain: 'physical', recall_period: 'Past week', estimated_minutes: 2 },
    questions: [
      {
        ...original.questions[0],
        prompt: 'Changed',
        metric_name: 'different_metric',
        unit: 'different',
        config: { min: 0, max: 100, step: 1 },
      },
    ],
  })
  const stale = await db.createAssessment(user(), {
    ...body(original, 4),
    assessed_at: '2026-11-18T13:00:00Z',
  })
  expect(stale.template_version).toBe(1)
  await db.updateAssessment(user(), entry.id, { notes: 'Later clarification' })
  const projected = await query(
    user(),
    'SELECT metric,unit,value FROM time_series WHERE source=$1 AND deleted_at IS NULL',
    [`assessment:${entry.id}`],
  )
  expect(projected.rows).toEqual([{ metric: 'ability_test', unit: 'score', value: 3 }])
  const exported = await db.exportPharmacology(user())
  expect(exported.questionnaire_template_versions).toHaveLength(2)
})

test('rejects invalid versions, duplicate answers, foreign questions and invalid ranges without saving', async () => {
  const t = await createQuestionnaire(user(), definition())
  const other = await createQuestionnaire(user(), { ...definition(), stable_key: 'another' })
  for (const invalid of [
    { ...body(t), template_version: 999 },
    { ...body(t), responses: [{ ...body(t).responses[0], question_version: 999 }] },
    { ...body(t), responses: body(other).responses },
    { ...body(t), responses: [...body(t).responses, ...body(t).responses] },
    body(t, 11),
    body(t, 0.5),
    body(t, null),
    body(t, '3'),
  ]) {
    await expect(db.createAssessment(user(), invalid)).rejects.toThrow()
  }
  expect(await db.listAssessments(user())).toEqual([])
  const saved = await db.createAssessment(user(), body(t))
  await expect(db.updateAssessment(user(), saved.id, { template_id: other.id })).rejects.toThrow()
  await expect(
    updateQuestionnaire(user(), t.id, { questions: [{ ...other.questions[0] }] }),
  ).rejects.toThrow()
})

test('unchanged instruments install; mutations cannot forge their identity; custom copies have no official score', async () => {
  const instrument = assessmentInstruments[0]
  expect(() => createQuestionnaire(user(), { ...instrument.definition, display_name: 'Forged' })).toThrow()
  const t = await createQuestionnaire(user(), instrument.definition)
  await expect(updateQuestionnaire(user(), t.id, { display_name: 'Edited' })).rejects.toThrow()
  const custom = await createQuestionnaire(user(), { ...instrument.definition, stable_key: 'custom_gad' })
  await expect(
    updateQuestionnaire(user(), custom.id, { stable_key: instrument.definition.stable_key }),
  ).rejects.toThrow()
  const answers = t.questions
    .slice(0, 7)
    .map((q) => ({ question_id: q.id, question_version: q.version, value: '0' }))
  const complete = await db.createAssessment(user(), { ...body(t), responses: answers })
  expect(instrumentScore(t, complete)).toBe(0)
  const partial = await db.createAssessment(user(), { ...body(t), responses: answers.slice(1) })
  expect(instrumentScore(t, partial)).toBeNull()
  const customEntry = await db.createAssessment(user(), {
    ...body(custom),
    responses: custom.questions
      .slice(0, 7)
      .map((q) => ({ question_id: q.id, question_version: q.version, value: '1' })),
  })
  expect(instrumentScore(custom, customEntry)).toBeNull()
})

test(
  'account boundaries apply to templates, frozen versions, assessments and exports',
  { timeout: 120000 },
  async () => {
    const t = await createQuestionnaire(user(), definition())
    const entry = await db.createAssessment(user(), body(t, 2))
    const other = await createTestDatabase()
    const pool = createRolePool({ connectionString: other.uri, max: 2 })
    _setDbForUser('assessment_other', pool)
    try {
      expect(await db.getQuestionnaire('assessment_other', t.id)).toBeNull()
      expect(await db.getAssessment('assessment_other', entry.id)).toBeNull()
      expect(await updateQuestionnaire('assessment_other', t.id, { display_name: 'Changed' })).toBeNull()
      await expect(db.createAssessment('assessment_other', body(t))).rejects.toThrow()
      const exported = await db.exportPharmacology('assessment_other')
      expect(exported.assessments).toEqual([])
      expect(JSON.stringify(exported.questionnaire_template_versions)).not.toContain(t.id)
    } finally {
      await pool.end()
      await other.drop()
    }
  },
)

test('concurrent edits serialize complete snapshots rather than mixing definitions', async () => {
  const t = await createQuestionnaire(user(), definition())
  await Promise.all(
    ['First', 'Second'].map((prompt) =>
      updateQuestionnaire(user(), t.id, { display_name: prompt, questions: [{ ...t.questions[0], prompt }] }),
    ),
  )
  const snapshots = await query(
    user(),
    'SELECT snapshot FROM questionnaire_template_versions WHERE template_id=$1 ORDER BY version',
    [t.id],
  )
  expect(snapshots.rows).toHaveLength(3)
  for (const row of snapshots.rows.slice(1)) {
    expect(row.snapshot.questions[0].prompt).toBe(row.snapshot.display_name)
  }
})

test('metadata-only API patches do not default omitted questions to an empty replacement', async () => {
  const t = await createQuestionnaire(user(), definition())
  const patch = updateQuestionnaireBodySchema.parse({ display_name: 'Renamed' })
  expect(patch).not.toHaveProperty('questions')
  const updated = await updateQuestionnaire(user(), t.id, patch)
  expect(updated?.questions).toEqual(t.questions)
  expect(updated?.version).toBe(2)
})

test('REAP-S partial drafts remain editable and finalization validates resulting responses', async () => {
  const template = await createQuestionnaire(user(), reapsDefinition)
  const answers = template.questions.map((q) => ({
    question_id: q.id,
    question_version: q.version,
    value: ((q.config.choices ?? q.config.options) as Array<{ value: string }>)[0].value,
  }))
  const draft = await submitAssessment(user(), {
    ...body(template),
    stage: 'draft',
    responses: answers.slice(0, 1),
  })
  expect(draft.responses).toHaveLength(1)
  const edited = await correctAssessment(user(), draft.id, { responses: answers.slice(0, 2) })
  expect(edited?.stage).toBe('draft')
  expect(edited?.responses).toHaveLength(2)
  await expect(correctAssessment(user(), draft.id, { stage: 'completed' })).rejects.toThrow()
  await expect(
    correctAssessment(user(), draft.id, { stage: 'completed', responses: answers.slice(0, 1) }),
  ).rejects.toThrow()
  await correctAssessment(user(), draft.id, { responses: answers })
  const completed = await correctAssessment(user(), draft.id, { stage: 'completed' })
  expect(completed?.responses).toHaveLength(answers.length)
  expect(completed?.stage).toBe('completed')
})
