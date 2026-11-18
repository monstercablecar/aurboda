import { z } from 'zod'

import { baseResponseSchema } from './common.ts'
import { assessmentSchema, assessmentAnswerSchema, questionnaireTemplateSchema } from './pharmacology.ts'
import { treatmentCheckinPlanBodySchema } from './treatment-checkin-plan.ts'

const timestamp = z.iso.datetime({ offset: true })
export const briefTreatmentAnswersSchema = z
  .object({
    mood: z.number().int().min(1).max(5).optional(),
    enjoyment: z.number().int().min(1).max(5).optional(),
    functioning: z.number().int().min(1).max(5).optional(),
    goal_progress: z.number().int().min(1).max(5).optional(),
    sleep: z.number().int().min(1).max(5).optional(),
    difficulties: z.enum(['none', 'some', 'unsure']).optional(),
    difficulty_detail: z.string().max(2000).optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict()
  .meta({
    id: 'BriefTreatmentAnswers',
    description: 'Unscored custom journal observations; not a validated clinical instrument.',
  })
export type BriefTreatmentAnswers = z.infer<typeof briefTreatmentAnswersSchema>
export const treatmentCheckinEntrySchema = z
  .object({
    answers: briefTreatmentAnswersSchema,
    responses: z.array(assessmentAnswerSchema).max(100).optional(),
    observed_at: timestamp,
    revision: z.number().int().min(0),
  })
  .meta({
    id: 'TreatmentCheckinEntry',
    description: 'Draft or final entry with an explicit observation time and optimistic revision.',
  })
export type TreatmentCheckinEntry = z.infer<typeof treatmentCheckinEntrySchema>
export const addTreatmentReflectionSchema = z
  .object({
    treatment_session_id: z.string().uuid(),
    kind: z.enum(['current', 'reflection']),
  })
  .meta({
    id: 'AddTreatmentReflection',
    description:
      'Start a current check-in or retrospective reflection without filling a missed historical window.',
  })
export type AddTreatmentReflection = z.infer<typeof addTreatmentReflectionSchema>
export const treatmentCheckinActionSchema = z
  .object({
    action: z.enum(['skip', 'snooze']),
    snooze_minutes: z.number().int().min(15).max(1440).optional(),
  })
  .meta({
    id: 'TreatmentCheckinAction',
    description: 'Skip an optional check-in or snooze its next reminder within the window.',
  })
export type TreatmentCheckinAction = z.infer<typeof treatmentCheckinActionSchema>
export const treatmentCheckinSchema = z
  .object({
    id: z.string().uuid(),
    treatment_session_id: z.string().uuid(),
    kind: z.enum(['before', 'after', 'next_day', 'later', 'current', 'reflection', 'custom']),
    status: z.enum([
      'upcoming',
      'due',
      'completed',
      'skipped',
      'window_passed',
      'canceled',
      'record_removed',
    ]),
    due_at: timestamp.nullable(),
    expires_at: timestamp.nullable(),
    snoozed_until: timestamp.nullable(),
    observed_at: timestamp.nullable(),
    draft: briefTreatmentAnswersSchema,
    draft_responses: z.array(assessmentAnswerSchema),
    questionnaire: questionnaireTemplateSchema.nullable(),
    revision: z.number().int(),
    assessment: assessmentSchema.nullable(),
    personal_goal: z.string(),
    answer_labels: z.record(z.string(), z.string()),
    created_at: timestamp,
  })
  .meta({
    id: 'TreatmentCheckin',
    description: 'One personal check-in and its shared assessment, with draft and timing preserved.',
  })
export type TreatmentCheckin = z.infer<typeof treatmentCheckinSchema>
export const treatmentCheckinsResponseSchema = baseResponseSchema
  .extend({
    data: z.array(treatmentCheckinSchema).optional(),
    plan: treatmentCheckinPlanBodySchema.nullable().optional(),
    scheduler_ready: z.boolean().optional(),
  })
  .meta({ id: 'TreatmentCheckinsResponse' })
export type TreatmentCheckinsResponse = z.infer<typeof treatmentCheckinsResponseSchema>
export const treatmentCheckinResponseSchema = baseResponseSchema
  .extend({ data: treatmentCheckinSchema.optional() })
  .meta({ id: 'TreatmentCheckinResponse' })
export type TreatmentCheckinResponse = z.infer<typeof treatmentCheckinResponseSchema>
