import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import {
  assessmentForLocalDate,
  dailyQuestionnaireDefinition,
  dateKeyInZone,
  questionSection,
  reapsDefinition,
  responseMap,
  scoreReapsAssessment,
  symptomTimeBucket,
} from './model'

const withIds = (template: typeof dailyQuestionnaireDefinition | typeof reapsDefinition): QuestionnaireTemplate => ({
  ...template,
  id: `${template.stable_key}-id`,
  version: 1,
  created_at: '2026-11-11T00:00:00Z',
  updated_at: '2026-11-11T00:00:00Z',
  questions: template.questions.map((question, index) => ({
    ...question,
    id: `${template.stable_key}-q${index}`,
    version: 1,
  })),
}) as QuestionnaireTemplate

describe('simple food model', () => {
  test('scores REAP-S v2 with published section cut points and readiness separate from total', () => {
    const template = withIds(reapsDefinition)
    const values = {
      not_well_enough_to_shop_or_cook: 'never',
      fewer_than_two_meals: 'never',
      less_than_three_ounces_protein: 'two_or_fewer',
      less_than_two_calcium_servings: 'never',
      vegetables_three_servings: 'more_than_3',
      fruit_two_servings: 'three_or_fewer',
      whole_grains_high_fiber: 'every_day',
      fish_shellfish: 'never',
      beans_legumes: 'more_than_3',
      nuts_nut_butters: 'three_or_fewer',
      vegetable_oils: 'every_day',
      high_fat_meats: 'three_or_fewer',
      solid_fats: 'never',
      sweet_drinks: 'more_than_3',
      sweets: 'three_or_fewer',
      packaged_snacks: 'never',
      restaurant_takeout_convenience: 'every_day',
      home_cooked_from_basic_ingredients: 'more_than_3',
      alcohol_above_guideline: 'never',
      exercise_walk_mile_or_15_minutes: 'three_or_fewer',
      readiness_to_change: 'interested',
    }
    const assessment = {
      id: 'assessment-1',
      template_id: template.id,
      template_version: 1,
      assessed_at: '2026-11-11T19:00:00Z',
      timezone: 'America/Denver',
      notes: null,
      responses: template.questions
        .filter((question) => question.stable_key in values)
        .map((question) => ({
          question_id: question.id,
          question_version: question.version,
          value: values[question.stable_key as keyof typeof values],
        })),
      created_at: '2026-11-11T19:00:00Z',
      updated_at: '2026-11-11T19:00:00Z',
    } as Assessment

    const scores = scoreReapsAssessment(assessment, template)
    expect(scores).not.toBeNull()
    expect(scores?.sections.food_sufficiency).toBe(11)
    expect(scores?.sections.healthy_pattern).toBe(12)
    expect(scores?.sections.low_nutrient_density).toBe(16)
    expect(scores?.sections.exercise).toBe(1)
    expect(scores?.total).toBe(40)
    expect(scores?.readiness).toBe('Interested')
  })

  test('finds one local-date questionnaire by the assessment timezone and preserves unknown distinct from missing', () => {
    const template = withIds(dailyQuestionnaireDefinition)
    const existing = {
      id: 'daily-1',
      template_id: template.id,
      template_version: 1,
      assessed_at: '2026-11-12T19:00:00Z',
      timezone: 'America/Denver',
      notes: 'Saved note',
      responses: [
        {
          question_id: template.questions[0].id,
          question_version: 1,
          value: 'unknown',
        },
      ],
      created_at: '2026-11-12T19:00:00Z',
      updated_at: '2026-11-12T20:00:00Z',
    } as Assessment
    expect(dateKeyInZone(existing.assessed_at, existing.timezone)).toBe('2026-11-12')
    expect(assessmentForLocalDate([existing], template.id, '2026-11-12')?.id).toBe('daily-1')
    expect(responseMap(existing, template).produce_frequency).toBe('unknown')
    expect(responseMap(existing, template)).not.toHaveProperty('added_sugar')
  })

  test('uses configured question sections and buckets fullness observations by local time of day', () => {
    const section = questionSection(withIds(reapsDefinition).questions[0])
    expect(section).toBe('Food sufficiency / insufficiency')
    expect(symptomTimeBucket('2026-11-11T07:30:00Z', 'America/Denver')).toBe('Overnight')
    expect(symptomTimeBucket('2026-11-11T15:30:00Z', 'America/Denver')).toBe('Morning')
    expect(symptomTimeBucket('2026-11-11T20:30:00Z', 'America/Denver')).toBe('Midday')
  })
})
