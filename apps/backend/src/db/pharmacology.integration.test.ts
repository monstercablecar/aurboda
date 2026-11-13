import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { pharmacologyTables } from '../schema/pharmacology.ts'
import { getTimeline, getToday } from '../services/pharmacology.ts'
import { cleanTestDb, getTestUser, startTestDb, stopTestDb } from '../test/db-test-helper.ts'
import { query } from './connection.ts'
import {
  confirmRegimenItems,
  createAdministration,
  createAssessment,
  createContextEvent,
  createContextEventType,
  createQuestionnaire,
  createRegimen,
  createSubstance,
  createTreatmentSession,
  createTreatmentType,
  exportPharmacology,
  listAdministrations,
  listTreatmentTypes,
  getTreatmentSession,
  listQuestionnaires,
  updateAdministration,
  updateContextEvent,
  updateSubstance,
} from './pharmacology.ts'

const TIMEOUT = 120_000
const substance = (display_name: string, dose_unit = 'mg') => ({
  display_name,
  category: 'supplement' as const,
  dose_unit,
  status: 'active' as const,
  tags: [],
  favorite: false,
})

describe('pharmacology database and service integration', () => {
  beforeAll(startTestDb, TIMEOUT)
  afterAll(stopTestDb)
  beforeEach(cleanTestDb)

  test('seeds chamomile and meditation ahead of ketamine without duplicating defaults', async () => {
    const user = getTestUser()
    await query(user, pharmacologyTables.treatment_types_seed)
    const first = await listTreatmentTypes(user)
    expect(first.map((type) => type.key)).toEqual(['chamomile', 'meditation', 'ketamine'])
    expect(first.slice(0, 2).every((type) => type.default_follow_up_hours.length === 0)).toBe(true)
    expect(first[2].default_follow_up_hours).toEqual([24, 48, 72, 168])
    await query(user, pharmacologyTables.treatment_types_seed)
    expect(await listTreatmentTypes(user)).toEqual(first)
  })

  test('upgrades existing catalogs while preserving customized types, questionnaires and session facts', async () => {
    const user = getTestUser()
    const ketamine = await createTreatmentType(user, { key: 'ketamine', display_name: 'My existing treatment', category: 'medicine_assisted_treatment', active: true, default_follow_up_hours: [12] })
    const chamomile = await createTreatmentType(user, { key: 'chamomile', display_name: 'My tea time', category: 'custom', active: false, default_follow_up_hours: [2] })
    const custom = await createTreatmentType(user, { key: 'custom', display_name: 'Custom session', category: 'custom', active: true, default_follow_up_hours: [] })
    const saved = await createTreatmentSession(user, { treatment_type_id: ketamine.id, actual_start: '2026-11-09T21:00:00Z', timezone: 'UTC', status: 'completed', adverse_events: [], metadata: {}, follow_up_hours: [12] })
    const existing = await createQuestionnaire(user, {
      stable_key: 'ketamine_pre_session', display_name: 'My preparation', moment: 'pre_treatment', enabled: false,
      questions: [{ stable_key: 'intention', prompt: 'My original question', response_type: 'long_text', required: false, enabled: true, sort_order: 10, anchors: {}, config: {} }],
    })
    const answer = await createAssessment(user, { template_id: existing.id, treatment_session_id: saved.id, stage: 'pre_session', assessed_at: '2026-11-09T20:00:00Z', timezone: 'UTC', responses: [{ question_id: existing.questions[0].id, question_version: existing.questions[0].version, value: 'An existing reflection' }] })
    const seed = async () => {
      for (const key of ['treatment_types_seed', 'questionnaire_templates_seed', 'assessment_questions_seed', 'assessment_question_versions_seed']) await query(user, pharmacologyTables[key])
    }
    await seed()
    const types = await listTreatmentTypes(user)
    expect(types.map((type) => type.key)).toEqual(['meditation', 'custom', 'ketamine', 'chamomile'])
    expect(types.find((type) => type.id === ketamine.id)).toEqual(ketamine)
    expect(types.find((type) => type.id === chamomile.id)).toEqual(chamomile)
    expect(types.find((type) => type.id === custom.id)).toEqual(custom)
    expect(await getTreatmentSession(user, saved.id)).toEqual(saved)
    const templates = await listQuestionnaires(user)
    const original = templates.find((template) => template.id === existing.id)!
    expect(original).toMatchObject({ display_name: 'My preparation', enabled: false })
    expect(original.questions.find((question) => question.id === existing.questions[0].id)).toEqual(existing.questions[0])
    const neutral = templates.filter((template) => ['session_preparation', 'session_reflection', 'session_follow_up'].includes(template.stable_key))
    expect(neutral).toHaveLength(3)
    expect(neutral.flatMap((template) => template.questions)).toHaveLength(5)
    expect(neutral.flatMap((template) => template.questions).every((question) => !question.required && question.response_type === 'long_text' && !question.metric_name)).toBe(true)
    const preparationIndex = templates.findIndex((template) => template.stable_key === 'session_preparation')
    expect(preparationIndex).toBeLessThan(templates.findIndex((template) => template.stable_key === 'ketamine_pre_session'))
    const snapshots = await query(user, 'SELECT question_id FROM assessment_question_versions WHERE question_id = ANY($1::uuid[])', [neutral.flatMap((template) => template.questions.map((question) => question.id))])
    expect(snapshots.rows).toHaveLength(5)
    const priorAnswer = await query(user, 'SELECT value FROM assessment_responses WHERE assessment_id = $1', [answer.id])
    expect(priorAnswer.rows[0].value).toBe('An existing reflection')
    await seed()
    expect(await listTreatmentTypes(user)).toEqual(types)
    expect(await listQuestionnaires(user)).toEqual(templates)
    expect(await getTreatmentSession(user, saved.id)).toEqual(saved)
  })

  test('preserves facts, handles partial/idempotent confirmation, corrections, projections, assessments, timeline, and export', async () => {
    const user = getTestUser()
    const [alpha, beta, gamma, delta] = await Promise.all([
      createSubstance(user, substance('Synthetic Alpha')),
      createSubstance(user, substance('Synthetic Beta')),
      createSubstance(user, substance('Synthetic Gamma')),
      createSubstance(user, substance('Synthetic Delta', 'mL')),
    ])
    const changed = await updateSubstance(user, alpha.id, { default_dose: 25, change_reason: 'synthetic update' })
    expect(changed?.version).toBe(2)

    const regimen = await createRegimen(user, {
      name: 'Morning Stack', schedule: { type: 'daily' }, status: 'active', sort_order: 0,
      reminder: { enabled: false, minutes_before: [] },
      items: [alpha, beta, gamma].map((item, sort_order) => ({ substance_id: item.id, dose: 10 + sort_order, dose_unit: 'mg', sort_order, paused: false })),
    })
    const confirmation = {
      administered_at: '2026-11-09T15:00:00Z', timezone: 'America/Denver', idempotency_key: 'morning-2026-11-09',
      items: regimen.items.slice(0, 2).map((item) => ({ item_id: item.id, dose: item.dose, dose_unit: item.dose_unit, status: 'taken' as const, side_effects: [] })),
    }
    const first = await confirmRegimenItems(user, regimen.id, confirmation)
    const retry = await confirmRegimenItems(user, regimen.id, confirmation)
    expect(first).toHaveLength(2)
    expect(retry?.map((event) => event.id)).toEqual(first?.map((event) => event.id))
    expect(await listAdministrations(user)).toHaveLength(2)
    expect((await listAdministrations(user)).some((event) => event.regimen_item_id === regimen.items[2].id)).toBe(false)

    const repeated = await createAdministration(user, { substance_id: alpha.id, administered_at: '2026-11-09T18:00:00Z', timezone: 'America/Denver', dose: 5, dose_unit: 'mg', status: 'taken', source: 'manual', side_effects: [], idempotency_key: 'repeat-alpha' })
    expect(repeated.substance_id).toBe(alpha.id)
    const corrected = await updateAdministration(user, first![0].id, { administered_at: '2026-11-10T15:00:00Z', dose: 20, correction_reason: 'synthetic correction' })
    expect(corrected?.dose).toBe(20)
    const revisions = await query(user, `SELECT * FROM administration_event_revisions WHERE administration_event_id=$1`, [first![0].id])
    expect(revisions.rows).toHaveLength(1)
    const projections = await query(user, `SELECT metric,value,deleted_at FROM time_series WHERE source='pharmacology' AND metric LIKE $1 ORDER BY time,metric`, ['pharmacology_synthetic_alpha%'])
    expect(projections.rows.some((row) => row.deleted_at == null && Number(row.value) === 20)).toBe(true)

    await createAdministration(user, { substance_id: delta.id, administered_at: '2026-11-09T20:00:00Z', timezone: 'America/Denver', dose: 2, dose_unit: 'mL', status: 'taken', source: 'prn', side_effects: [], idempotency_key: 'prn-delta' })
    expect(changed?.default_dose).toBe(25)
    expect(repeated.dose).toBe(5)

    const questionnaire = await createQuestionnaire(user, {
      stable_key: 'synthetic_midday', display_name: 'Synthetic midday', moment: 'midday', enabled: true,
      questions: [{ stable_key: 'focus', prompt: 'Synthetic focus?', response_type: 'likert', required: true, enabled: true, sort_order: 0, metric_name: 'synthetic_midday_focus', unit: 'score', anchors: {}, config: { min: 1, max: 5 } }],
    })
    const assessment = await createAssessment(user, { template_id: questionnaire.id, assessed_at: '2026-11-09T19:00:00Z', timezone: 'America/Denver', responses: [{ question_id: questionnaire.questions[0].id, question_version: questionnaire.questions[0].version, value: 4 }] })
    expect(assessment.responses[0].value).toBe(4)
    const questionVersions = await query(user, `SELECT snapshot FROM assessment_question_versions WHERE question_id=$1`, [questionnaire.questions[0].id])
    expect(questionVersions.rows[0].snapshot.prompt).toBe('Synthetic focus?')
    const assessmentMetric = await query(user, `SELECT value FROM time_series WHERE source=$1 AND deleted_at IS NULL`, [`assessment:${assessment.id}`])
    expect(Number(assessmentMetric.rows[0].value)).toBe(4)

    const treatmentType = await createTreatmentType(user, { key: 'synthetic_treatment', display_name: 'Synthetic treatment', category: 'test', active: true, default_follow_up_hours: [2, 24] })
    const treatment = await createTreatmentSession(user, { treatment_type_id: treatmentType.id, actual_start: '2026-11-09T21:00:00Z', timezone: 'America/Denver', status: 'completed', adverse_events: [], metadata: {}, follow_up_hours: [24] })
    await createAdministration(user, { substance_id: delta.id, treatment_session_id: treatment.id, administered_at: '2026-11-09T21:05:00Z', timezone: 'America/Denver', dose: 1, dose_unit: 'mL', status: 'taken', source: 'treatment', side_effects: [], idempotency_key: 'treatment-dose' })

    for (const [stable_key, moment, stage, assessed_at] of [
      ['synthetic_post', 'post_treatment', 'post_session', '2026-11-09T22:00:00Z'],
      ['synthetic_next_day', 'follow_up', 'next_day', '2026-11-10T18:00:00Z'],
    ] as const) {
      const template = await createQuestionnaire(user, {
        stable_key, display_name: stable_key, moment, enabled: true,
        questions: [{ stable_key: 'wellbeing', prompt: 'Synthetic wellbeing?', response_type: 'numeric', required: true, enabled: true, sort_order: 0, metric_name: `${stable_key}_score`, unit: 'score', anchors: {}, config: { min: 0, max: 10 } }],
      })
      await createAssessment(user, { template_id: template.id, treatment_session_id: treatment.id, stage, assessed_at, timezone: 'America/Denver', responses: [{ question_id: template.questions[0].id, question_version: template.questions[0].version, value: 7 }] })
    }
    const contextType = await createContextEventType(user, { key: 'synthetic_context', display_name: 'Synthetic context', active: true })
    await createContextEvent(user, { event_type_id: contextType.id, started_at: '2026-11-09T17:00:00Z', timezone: 'America/Denver', metadata: {} })

    const today = await getToday(user, 'America/Denver', '2026-11-09')
    expect(today.due_regimens[0].incomplete_item_ids).toContain(regimen.items[2].id)
    expect(today.due_regimens[0].state).toBe('partial')

    const timeline = await getTimeline(user, '2026-11-09T00:00:00Z', '2026-11-11T00:00:00Z')
    expect(timeline.some((entry) => entry.type === 'treatment')).toBe(true)
    expect(timeline.some((entry) => entry.type === 'assessment')).toBe(true)
    expect(timeline.some((entry) => entry.type === 'context')).toBe(true)
    const exported = await exportPharmacology(user)
    expect(exported.substances).toHaveLength(4)
    expect(exported.administration_event_revisions).toHaveLength(1)
    expect(exported.assessment_responses).toHaveLength(3)
    expect(exported.context_events).toHaveLength(1)
  })

  test('projects mapped single-choice assessments and simple-food context events into metrics without turning unknown into zero', async () => {
    const user = getTestUser()
    const questionnaire = await createQuestionnaire(user, {
      stable_key: 'simple_food_daily_test',
      display_name: 'Simple food daily test',
      moment: 'custom',
      enabled: true,
      questions: [
        {
          stable_key: 'produce_frequency',
          prompt: 'How often did you eat vegetables or fruit today?',
          response_type: 'single_choice',
          required: false,
          enabled: true,
          sort_order: 0,
          metric_name: 'simple_food_produce_frequency',
          unit: 'ordinal',
          anchors: {},
          config: {
            numeric_map: { none: 0, once: 1, twice_or_more: 2 },
            options: [
              { value: 'none', label: 'None' },
              { value: 'once', label: 'Once' },
              { value: 'twice_or_more', label: 'Twice or more' },
              { value: 'unknown', label: 'Not sure' },
            ],
          },
        },
      ],
    })

    const assessment = await createAssessment(user, {
      template_id: questionnaire.id,
      assessed_at: '2026-11-11T19:00:00Z',
      timezone: 'America/Denver',
      responses: [
        {
          question_id: questionnaire.questions[0].id,
          question_version: questionnaire.questions[0].version,
          value: 'twice_or_more',
        },
      ],
    })
    let projected = await query(user, `SELECT value FROM time_series WHERE source=$1 AND metric='simple_food_produce_frequency' AND deleted_at IS NULL`, [`assessment:${assessment.id}`])
    expect(Number(projected.rows[0].value)).toBe(2)

    const unknown = await createAssessment(user, {
      template_id: questionnaire.id,
      assessed_at: '2026-11-12T19:00:00Z',
      timezone: 'America/Denver',
      responses: [
        {
          question_id: questionnaire.questions[0].id,
          question_version: questionnaire.questions[0].version,
          value: 'unknown',
        },
      ],
    })
    projected = await query(user, `SELECT value FROM time_series WHERE source=$1 AND metric='simple_food_produce_frequency' AND deleted_at IS NULL`, [`assessment:${unknown.id}`])
    expect(projected.rows).toHaveLength(0)

    const fullnessType = await createContextEventType(user, {
      key: 'simple_food_fullness',
      display_name: 'Simple Food · Fullness',
      description: 'Simple food fullness test',
      active: true,
    })
    const entry = await createContextEvent(user, {
      event_type_id: fullnessType.id,
      started_at: '2026-11-11T20:15:00Z',
      timezone: 'America/Denver',
      intensity: 4,
      notes: 'Testing projection',
      metadata: { source: 'simple_food' },
    })
    let eventProjection = await query(user, `SELECT value, deleted_at FROM time_series WHERE source=$1 AND metric='simple_food_fullness'`, [`sfctx:${entry.id}`])
    expect(Number(eventProjection.rows[0].value)).toBe(4)
    expect(eventProjection.rows[0].deleted_at).toBeNull()

    await updateContextEvent(user, entry.id, {
      intensity: 1,
      notes: 'Corrected',
    })
    eventProjection = await query(user, `SELECT value, deleted_at FROM time_series WHERE source=$1 AND metric='simple_food_fullness' AND deleted_at IS NULL`, [`sfctx:${entry.id}`])
    expect(Number(eventProjection.rows[0].value)).toBe(1)

    await query(user, `UPDATE context_events SET intensity = NULL, updated_at = NOW() WHERE id = $1`, [entry.id])
    const refreshed = await updateContextEvent(user, entry.id, { notes: 'No intensity now' })
    expect(refreshed).not.toBeNull()
    expect(refreshed?.intensity).toBeUndefined()
    const stored = await query(user, 'SELECT intensity FROM context_events WHERE id = $1', [entry.id])
    expect(stored.rows[0].intensity).toBeNull()
    eventProjection = await query(user, `SELECT deleted_at FROM time_series WHERE source=$1 AND metric='simple_food_fullness'`, [`sfctx:${entry.id}`])
    expect(eventProjection.rows[0].deleted_at).not.toBeNull()
  })
})
