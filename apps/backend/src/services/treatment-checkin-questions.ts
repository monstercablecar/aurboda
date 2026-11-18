import type { BriefTreatmentAnswers, QuestionnaireTemplate } from '@aurboda/api-spec'

import type { Queryable } from '../db/pool.ts'

import { getQuestionnaire } from '../db/pharmacology.ts'

export const BRIEF_TREATMENT_KEY = 'treatment_brief_v1'
export const briefQuestions: {
  key: keyof BriefTreatmentAnswers
  prompt: string
  type: string
  anchors?: Record<string, string>
}[] = [
  {
    key: 'mood',
    prompt: 'How is your mood?',
    type: 'likert',
    anchors: { '1': 'Very low', '5': 'Very good' },
  },
  {
    key: 'enjoyment',
    prompt: 'How much interest or enjoyment are you feeling?',
    type: 'likert',
    anchors: { '1': 'None', '5': 'A lot' },
  },
  {
    key: 'functioning',
    prompt: 'How manageable are everyday activities?',
    type: 'likert',
    anchors: { '1': 'Very difficult', '5': 'Very manageable' },
  },
  {
    key: 'goal_progress',
    prompt: 'How manageable is your personal goal?',
    type: 'likert',
    anchors: { '1': 'Very difficult', '5': 'Very manageable' },
  },
  {
    key: 'sleep',
    prompt: 'How was your most recent sleep?',
    type: 'likert',
    anchors: { '1': 'Very poor', '5': 'Very good' },
  },
  { key: 'difficulties', prompt: 'Any unwanted effects or difficulties to record?', type: 'single_choice' },
  {
    key: 'difficulty_detail',
    prompt: 'What would you like to record about the difficulties?',
    type: 'long_text',
  },
  { key: 'notes', prompt: 'Anything else you want to remember?', type: 'long_text' },
]

export const ensureBriefTemplate = async (tx: Queryable): Promise<QuestionnaireTemplate> => {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO questionnaire_templates(stable_key, display_name, description, moment)
     VALUES ($1, 'Brief treatment check-in', 'Personal journal observations. No clinical score; not monitored by a clinician.', 'custom')
     ON CONFLICT(stable_key) DO UPDATE SET stable_key=EXCLUDED.stable_key RETURNING id`,
    [BRIEF_TREATMENT_KEY],
  )
  const id = result.rows[0]!.id
  for (const [index, question] of briefQuestions.entries()) {
    const config =
      question.type === 'likert'
        ? { min: 1, max: 5 }
        : question.type === 'single_choice'
          ? { choices: ['none', 'some', 'unsure'] }
          : {}
    await tx.query(
      `INSERT INTO assessment_questions(template_id, stable_key, prompt, response_type, required, enabled, sort_order, anchors, config)
      VALUES ($1,$2,$3,$4,false,true,$5,$6::jsonb,$7::jsonb) ON CONFLICT(template_id, stable_key) DO NOTHING`,
      [
        id,
        question.key,
        question.prompt,
        question.type,
        index,
        JSON.stringify(question.anchors ?? {}),
        JSON.stringify(config),
      ],
    )
  }
  await tx.query(
    `INSERT INTO assessment_question_versions(question_id, version, snapshot)
    SELECT id, version, to_jsonb(q) FROM assessment_questions q WHERE template_id=$1 ON CONFLICT(question_id, version) DO NOTHING`,
    [id],
  )
  return (await getQuestionnaire(tx, id))!
}
