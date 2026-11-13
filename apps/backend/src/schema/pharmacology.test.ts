import { describe, expect, test } from 'vitest'

import { pharmacologyTables } from './pharmacology.ts'

describe('pharmacology seed data', () => {
  test('seeds the editable daily scales with their specified labels and anchors', () => {
    const seed = pharmacologyTables.assessment_questions_seed
    expect(seed).toContain('Restedness')
    expect(seed).toContain('Exceptionally restored')
    expect(seed).toContain('Morning energy')
    expect(seed).toContain('Sleep inertia')
    expect(seed).toContain('Task initiation ease')
    expect(seed).toContain('Natural motivation')
    expect(seed).toContain('Enjoyment/reward')
    expect(seed).toContain('Satisfaction with the day')
    expect(seed.match(/'Optional notes'/g)).toHaveLength(2)
  })

  test('seeds the prescribed ketamine pre, post, and next-day prompts without clinical claims', () => {
    const seed = pharmacologyTables.assessment_questions_seed
    expect(seed).toContain('Current cognitive clarity')
    expect(seed).toContain('Optional preparation notes')
    expect(seed).toContain('Perceived personal significance')
    expect(seed).toContain('Difficulty of the experience')
    expect(seed).toContain('Which insights still seem meaningful?')
    expect(seed).toContain('What concrete behavior or decision could reflect those insights?')
    expect(pharmacologyTables.treatment_types_seed).toContain('[24,48,72,168]')
  })

  test('retains immutable question definitions so historical answers stay interpretable', () => {
    expect(pharmacologyTables.assessment_question_versions).toContain('UNIQUE (question_id, version)')
    expect(pharmacologyTables.assessment_question_versions_seed).toContain('assessment_question_versions')
    expect(pharmacologyTables.assessment_question_versions_seed).toContain("'prompt', q.prompt")
    expect(pharmacologyTables.assessment_question_versions_seed).toContain("'anchors', q.anchors")
  })
})
