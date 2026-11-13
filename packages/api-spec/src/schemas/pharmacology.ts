import { z } from 'zod'

import { baseResponseSchema, createDataArrayResponseSchema, createDataResponseSchema } from './common.ts'
import { ianaTimezoneSchema } from './timezone.ts'

const dateSchema = z.iso.date()
const dateTimeSchema = z.iso.datetime({ offset: true })
const nullableText = z.string().max(10_000).nullable().optional()
const uuid = z.string().uuid()
const jsonObjectSchema = z.record(z.string(), z.unknown())

export const substanceCategorySchema = z
  .enum(['prescription', 'otc', 'supplement', 'nootropic', 'caffeine', 'other'])
  .meta({ id: 'SubstanceCategory', description: 'User-facing substance category.' })
export type SubstanceCategory = z.infer<typeof substanceCategorySchema>

export const substanceStatusSchema = z.enum(['active', 'inactive', 'archived']).meta({
  id: 'SubstanceStatus',
  description: 'Whether a substance is currently used, inactive, or archived.',
})
export type SubstanceStatus = z.infer<typeof substanceStatusSchema>

export const substanceSchema = z
  .object({
    id: uuid,
    analysis_key: z.string().max(20).regex(/^[a-z][a-z0-9_]*$/),
    display_name: z.string().min(1).max(200),
    generic_name: z.string().nullable().optional(),
    brand_name: z.string().nullable().optional(),
    category: substanceCategorySchema,
    custom_category: z.string().nullable().optional(),
    formulation: z.string().nullable().optional(),
    route: z.string().nullable().optional(),
    strength: z.number().positive().nullable().optional(),
    strength_unit: z.string().nullable().optional(),
    default_dose: z.number().positive().nullable().optional(),
    dose_unit: z.string().min(1).max(20),
    manufacturer: z.string().nullable().optional(),
    start_date: dateSchema.nullable().optional(),
    end_date: dateSchema.nullable().optional(),
    status: substanceStatusSchema,
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    favorite: z.boolean().default(false),
    version: z.number().int().positive(),
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  })
  .meta({ id: 'Substance', description: 'Medication, supplement, or other administered substance.' })
export type Substance = z.infer<typeof substanceSchema>

export const createSubstanceBodySchema = substanceSchema
  .omit({ id: true, version: true, created_at: true, updated_at: true })
  .extend({
    analysis_key: substanceSchema.shape.analysis_key.optional(),
    status: substanceStatusSchema.default('active'),
    tags: z.array(z.string()).default([]),
    favorite: z.boolean().default(false),
  })
  .meta({ id: 'CreateSubstanceBody', description: 'Create a substance and its first immutable version.' })
export type CreateSubstanceBody = z.infer<typeof createSubstanceBodySchema>

export const updateSubstanceBodySchema = createSubstanceBodySchema
  .partial()
  .extend({
    generic_name: nullableText,
    brand_name: nullableText,
    custom_category: nullableText,
    formulation: nullableText,
    route: nullableText,
    strength: z.number().positive().nullable().optional(),
    strength_unit: nullableText,
    default_dose: z.number().positive().nullable().optional(),
    manufacturer: nullableText,
    start_date: dateSchema.nullable().optional(),
    end_date: dateSchema.nullable().optional(),
    notes: nullableText,
    change_reason: z.string().max(1000).optional(),
  })
  .meta({ id: 'UpdateSubstanceBody', description: 'Patch mutable substance configuration.' })
export type UpdateSubstanceBody = z.infer<typeof updateSubstanceBodySchema>

const scheduleDates = { start_date: dateSchema.optional(), end_date: dateSchema.optional() }
export const scheduleRuleSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('daily'), ...scheduleDates }),
    z.object({ type: z.literal('weekdays'), weekdays: z.array(z.number().int().min(1).max(7)).min(1), ...scheduleDates }),
    z.object({ type: z.literal('every_n_days'), interval_days: z.number().int().min(1).max(365), anchor_date: dateSchema, ...scheduleDates }),
    z.object({ type: z.literal('weekly'), weekday: z.number().int().min(1).max(7), ...scheduleDates }),
    z.object({ type: z.literal('monthly'), day_of_month: z.number().int().min(1).max(31), ...scheduleDates }),
    z.object({ type: z.literal('specific_date'), date: dateSchema }),
    z.object({ type: z.literal('interval'), interval_hours: z.number().positive().max(24 * 365), anchor_at: dateTimeSchema, ...scheduleDates }),
    z.object({ type: z.literal('as_needed'), ...scheduleDates }),
    z.object({ type: z.literal('none'), ...scheduleDates }),
  ])
  .meta({ id: 'ScheduleRule', description: 'Local-calendar recurrence rule. Weekdays use ISO 1=Monday through 7=Sunday.' })
export type ScheduleRule = z.infer<typeof scheduleRuleSchema>

export const regimenStatusSchema = z.enum(['active', 'paused', 'archived']).meta({
  id: 'RegimenStatus',
  description: 'Regimen lifecycle state.',
})

export const regimenItemInputSchema = z
  .object({
    id: uuid.optional(),
    substance_id: uuid,
    dose: z.number().positive(),
    dose_unit: z.string().min(1).max(20),
    route: z.string().max(100).nullable().optional(),
    scheduled_local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).nullable().optional(),
    schedule_override: scheduleRuleSchema.nullable().optional(),
    sort_order: z.number().int().default(0),
    paused: z.boolean().default(false),
    start_date: dateSchema.nullable().optional(),
    end_date: dateSchema.nullable().optional(),
  })
  .meta({ id: 'RegimenItemInput', description: 'Configured substance dose within a regimen.' })
export type RegimenItemInput = z.infer<typeof regimenItemInputSchema>

export const regimenItemSchema = regimenItemInputSchema
  .omit({ id: true })
  .extend({
    id: uuid,
    regimen_id: uuid,
    substance: substanceSchema.pick({ id: true, analysis_key: true, display_name: true, status: true }),
  })
  .meta({ id: 'RegimenItem', description: 'Regimen item resolved with its current substance summary.' })
export type RegimenItem = z.infer<typeof regimenItemSchema>

export const reminderConfigSchema = z
  .object({ enabled: z.boolean().default(false), minutes_before: z.array(z.number().int().min(0).max(10080)).default([]) })
  .passthrough()
  .meta({ id: 'ReminderConfig', description: 'Stored reminder metadata for a future notification layer.' })

export const regimenSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).max(200),
    description: z.string().nullable().optional(),
    schedule: scheduleRuleSchema,
    start_date: dateSchema.nullable().optional(),
    end_date: dateSchema.nullable().optional(),
    status: regimenStatusSchema,
    sort_order: z.number().int(),
    reminder: reminderConfigSchema,
    version: z.number().int().positive(),
    items: z.array(regimenItemSchema),
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  })
  .meta({ id: 'Regimen', description: 'A scheduled or as-needed group of substance configurations.' })
export type Regimen = z.infer<typeof regimenSchema>

export const createRegimenBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    schedule: scheduleRuleSchema,
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional(),
    status: regimenStatusSchema.default('active'),
    sort_order: z.number().int().default(0),
    reminder: reminderConfigSchema.default({ enabled: false, minutes_before: [] }),
    items: z.array(regimenItemInputSchema).default([]),
  })
  .meta({ id: 'CreateRegimenBody', description: 'Create a regimen with owned items.' })
export type CreateRegimenBody = z.infer<typeof createRegimenBodySchema>

export const updateRegimenBodySchema = createRegimenBodySchema
  .partial()
  .extend({ description: nullableText, start_date: dateSchema.nullable().optional(), end_date: dateSchema.nullable().optional(), change_reason: z.string().max(1000).optional() })
  .meta({ id: 'UpdateRegimenBody', description: 'Patch regimen configuration; supplied items replace the item list.' })
export type UpdateRegimenBody = z.infer<typeof updateRegimenBodySchema>

export const administrationStatusSchema = z
  .enum(['taken', 'skipped', 'delayed', 'partially_taken', 'unknown', 'canceled', 'entered_in_error'])
  .meta({ id: 'AdministrationStatus', description: 'Observed administration outcome. Only taken, delayed, and partially_taken count as exposure.' })
export type AdministrationStatus = z.infer<typeof administrationStatusSchema>

const administrationFields = {
  substance_id: uuid,
  regimen_item_id: uuid.nullable().optional(),
  treatment_session_id: uuid.nullable().optional(),
  administered_at: dateTimeSchema,
  scheduled_at: dateTimeSchema.nullable().optional(),
  timezone: ianaTimezoneSchema,
  dose: z.number().positive().nullable().optional(),
  dose_unit: z.string().min(1).max(20).nullable().optional(),
  route: z.string().max(100).nullable().optional(),
  status: administrationStatusSchema,
  source: z.string().min(1).max(100).default('manual'),
  reason: z.string().max(2000).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  side_effects: z.array(z.string()).default([]),
  idempotency_key: z.string().min(1).max(255).nullable().optional(),
}

const validateAdministrationDose = (value: { status: AdministrationStatus; dose?: number | null; dose_unit?: string | null }) =>
  !['taken', 'delayed', 'partially_taken'].includes(value.status) || (value.dose != null && value.dose > 0 && !!value.dose_unit)

export const administrationEventSchema = z
  .object({
    id: uuid,
    ...administrationFields,
    deleted_at: dateTimeSchema.nullable().optional(),
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  })
  .refine(validateAdministrationDose, { message: 'Exposure statuses require a positive dose and dose_unit.' })
  .meta({ id: 'AdministrationEvent', description: 'An observed administration fact retaining its exact dose, route, timezone, and correction history.' })
export type AdministrationEvent = z.infer<typeof administrationEventSchema>

export const createAdministrationBodySchema = z
  .object(administrationFields)
  .refine(validateAdministrationDose, { message: 'Exposure statuses require a positive dose and dose_unit.' })
  .meta({ id: 'CreateAdministrationBody', description: 'Record an observed administration. An idempotency key makes retries safe.' })
export type CreateAdministrationBody = z.infer<typeof createAdministrationBodySchema>

export const updateAdministrationBodySchema = z
  .object(administrationFields)
  .partial()
  .extend({ correction_reason: z.string().max(2000).optional() })
  .meta({ id: 'UpdateAdministrationBody', description: 'Correct an administration after preserving its prior immutable revision.' })
export type UpdateAdministrationBody = z.infer<typeof updateAdministrationBodySchema>

export const confirmRegimenItemSchema = z
  .object({
    item_id: uuid,
    dose: z.number().positive().nullable().optional(),
    dose_unit: z.string().min(1).max(20).nullable().optional(),
    route: z.string().max(100).nullable().optional(),
    status: administrationStatusSchema,
    reason: z.string().max(2000).optional(),
    notes: z.string().max(10_000).optional(),
    side_effects: z.array(z.string()).default([]),
  })
  .refine(validateAdministrationDose, { message: 'Exposure statuses require a positive dose and dose_unit.' })
  .meta({ id: 'ConfirmRegimenItem', description: 'One explicitly selected regimen item confirmation.' })

export const confirmRegimenBodySchema = z
  .object({
    administered_at: dateTimeSchema,
    timezone: ianaTimezoneSchema,
    scheduled_at: dateTimeSchema.optional(),
    idempotency_key: z.string().min(1).max(255),
    items: z.array(confirmRegimenItemSchema).min(1),
  })
  .meta({ id: 'ConfirmRegimenBody', description: 'Atomically confirm only the submitted regimen items with deterministic child idempotency.' })
export type ConfirmRegimenBody = z.infer<typeof confirmRegimenBodySchema>

export const treatmentTypeSchema = z
  .object({ id: uuid, key: z.string().regex(/^[a-z][a-z0-9_]*$/), display_name: z.string().min(1).max(200), category: z.string().min(1).max(100), description: z.string().nullable().optional(), active: z.boolean(), default_follow_up_hours: z.array(z.number().int().min(0).max(8760)), created_at: dateTimeSchema, updated_at: dateTimeSchema })
  .meta({ id: 'TreatmentType', description: 'User-editable treatment catalogue entry.' })
export type TreatmentType = z.infer<typeof treatmentTypeSchema>
export const createTreatmentTypeBodySchema = treatmentTypeSchema.omit({ id: true, created_at: true, updated_at: true }).meta({ id: 'CreateTreatmentTypeBody', description: 'Create a treatment type.' })
export type CreateTreatmentTypeBody = z.infer<typeof createTreatmentTypeBodySchema>
export const updateTreatmentTypeBodySchema = createTreatmentTypeBodySchema.partial().extend({ description: nullableText }).meta({ id: 'UpdateTreatmentTypeBody', description: 'Patch a treatment type.' })
export type UpdateTreatmentTypeBody = z.infer<typeof updateTreatmentTypeBodySchema>

export const treatmentStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'canceled', 'incomplete', 'archived']).meta({ id: 'TreatmentStatus', description: 'Treatment session state.' })
export const treatmentSessionSchema = z
  .object({
    id: uuid, treatment_type: treatmentTypeSchema, planned_at: dateTimeSchema.nullable().optional(), actual_start: dateTimeSchema.nullable().optional(), actual_end: dateTimeSchema.nullable().optional(), timezone: ianaTimezoneSchema, status: treatmentStatusSchema, setting: z.string().nullable().optional(), provider: z.string().nullable().optional(), protocol_reference: z.string().nullable().optional(), intention: z.string().nullable().optional(), notes: z.string().nullable().optional(), concerns: z.string().nullable().optional(), preparation_notes: z.string().nullable().optional(), adverse_events: z.array(z.string()), metadata: jsonObjectSchema, follow_up_hours: z.array(z.number().int().min(0).max(8760)), created_at: dateTimeSchema, updated_at: dateTimeSchema, deleted_at: dateTimeSchema.nullable().optional(),
  })
  .meta({ id: 'TreatmentSession', description: 'Planned or observed treatment/recovery session.' })
export type TreatmentSession = z.infer<typeof treatmentSessionSchema>
export const createTreatmentSessionBodySchema = z.object({ treatment_type_id: uuid, planned_at: dateTimeSchema.optional(), actual_start: dateTimeSchema.optional(), actual_end: dateTimeSchema.optional(), timezone: ianaTimezoneSchema, status: treatmentStatusSchema.default('planned'), setting: z.string().optional(), provider: z.string().optional(), protocol_reference: z.string().optional(), intention: z.string().optional(), notes: z.string().optional(), concerns: z.string().optional(), preparation_notes: z.string().optional(), adverse_events: z.array(z.string()).default([]), metadata: jsonObjectSchema.default({}), follow_up_hours: z.array(z.number().int().min(0).max(8760)).default([]) }).meta({ id: 'CreateTreatmentSessionBody', description: 'Create a treatment session.' })
export type CreateTreatmentSessionBody = z.infer<typeof createTreatmentSessionBodySchema>
export const updateTreatmentSessionBodySchema = createTreatmentSessionBodySchema.partial().extend({ planned_at: dateTimeSchema.nullable().optional(), actual_start: dateTimeSchema.nullable().optional(), actual_end: dateTimeSchema.nullable().optional(), setting: nullableText, provider: nullableText, protocol_reference: nullableText, intention: nullableText, notes: nullableText, concerns: nullableText, preparation_notes: nullableText }).meta({ id: 'UpdateTreatmentSessionBody', description: 'Patch a treatment session.' })
export type UpdateTreatmentSessionBody = z.infer<typeof updateTreatmentSessionBodySchema>

export const assessmentResponseTypeSchema = z.enum(['numeric', 'likert', 'yes_no', 'single_choice', 'multiple_choice', 'short_text', 'long_text', 'datetime', 'tags']).meta({ id: 'AssessmentResponseType', description: 'Question response shape.' })
export const assessmentQuestionSchema = z.object({ id: uuid, stable_key: z.string().regex(/^[a-z][a-z0-9_]*$/), version: z.number().int().positive(), prompt: z.string().min(1), response_type: assessmentResponseTypeSchema, required: z.boolean(), enabled: z.boolean(), sort_order: z.number().int(), metric_name: z.string().max(50).nullable().optional(), unit: z.string().max(20).nullable().optional(), anchors: jsonObjectSchema, config: jsonObjectSchema }).meta({ id: 'AssessmentQuestion', description: 'Versioned questionnaire question.' })
export type AssessmentQuestion = z.infer<typeof assessmentQuestionSchema>
export const questionnaireMomentSchema = z.enum(['morning', 'midday', 'evening', 'pre_treatment', 'post_treatment', 'follow_up', 'custom']).meta({ id: 'QuestionnaireMoment', description: 'Intended assessment moment.' })
export const questionnaireTemplateSchema = z.object({ id: uuid, stable_key: z.string().regex(/^[a-z][a-z0-9_]*$/), display_name: z.string().min(1).max(200), description: z.string().nullable().optional(), moment: questionnaireMomentSchema, enabled: z.boolean(), version: z.number().int().positive(), questions: z.array(assessmentQuestionSchema), created_at: dateTimeSchema, updated_at: dateTimeSchema }).meta({ id: 'QuestionnaireTemplate', description: 'Editable versioned assessment template.' })
export type QuestionnaireTemplate = z.infer<typeof questionnaireTemplateSchema>
const questionInputSchema = assessmentQuestionSchema.omit({ id: true, version: true }).extend({ id: uuid.optional(), version: z.number().int().positive().optional() })
export const createQuestionnaireBodySchema = questionnaireTemplateSchema.omit({ id: true, version: true, questions: true, created_at: true, updated_at: true }).extend({ questions: z.array(questionInputSchema).default([]) }).meta({ id: 'CreateQuestionnaireBody', description: 'Create a questionnaire template.' })
export type CreateQuestionnaireBody = z.infer<typeof createQuestionnaireBodySchema>
export const updateQuestionnaireBodySchema = createQuestionnaireBodySchema.partial().extend({ description: nullableText }).meta({ id: 'UpdateQuestionnaireBody', description: 'Patch a questionnaire and optionally replace questions.' })
export type UpdateQuestionnaireBody = z.infer<typeof updateQuestionnaireBodySchema>

export const assessmentAnswerSchema = z.object({ question_id: uuid, question_version: z.number().int().positive(), value: z.unknown() }).meta({ id: 'AssessmentAnswer', description: 'Raw response bound to an immutable question version.' })
export type AssessmentAnswer = z.infer<typeof assessmentAnswerSchema>
export const assessmentSchema = z.object({ id: uuid, template_id: uuid, template_version: z.number().int().positive(), treatment_session_id: uuid.nullable().optional(), stage: z.string().nullable().optional(), assessed_at: dateTimeSchema, timezone: ianaTimezoneSchema, notes: z.string().nullable().optional(), responses: z.array(assessmentAnswerSchema), created_at: dateTimeSchema, updated_at: dateTimeSchema, deleted_at: dateTimeSchema.nullable().optional() }).meta({ id: 'Assessment', description: 'Assessment fact with raw version-bound responses.' })
export type Assessment = z.infer<typeof assessmentSchema>
export const submitAssessmentBodySchema = z.object({ template_id: uuid, treatment_session_id: uuid.optional(), stage: z.string().max(100).optional(), assessed_at: dateTimeSchema, timezone: ianaTimezoneSchema, notes: z.string().max(10_000).optional(), responses: z.array(assessmentAnswerSchema).min(1) }).meta({ id: 'SubmitAssessmentBody', description: 'Submit raw assessment responses and numeric analysis projections.' })
export type SubmitAssessmentBody = z.infer<typeof submitAssessmentBodySchema>
export const correctAssessmentBodySchema = submitAssessmentBodySchema.partial().extend({ notes: nullableText, correction_reason: z.string().max(2000).optional() }).meta({ id: 'CorrectAssessmentBody', description: 'Correct an assessment and replace its projections.' })
export type CorrectAssessmentBody = z.infer<typeof correctAssessmentBodySchema>

export const contextEventTypeSchema = z.object({ id: uuid, key: z.string().regex(/^[a-z][a-z0-9_]*$/), display_name: z.string().min(1).max(200), description: z.string().nullable().optional(), active: z.boolean(), created_at: dateTimeSchema, updated_at: dateTimeSchema }).meta({ id: 'ContextEventType', description: 'User-defined contextual event type.' })
export type ContextEventType = z.infer<typeof contextEventTypeSchema>
export const createContextEventTypeBodySchema = contextEventTypeSchema.omit({ id: true, created_at: true, updated_at: true }).meta({ id: 'CreateContextEventTypeBody', description: 'Create a contextual event type.' })
export type CreateContextEventTypeBody = z.infer<typeof createContextEventTypeBodySchema>
export const updateContextEventTypeBodySchema = createContextEventTypeBodySchema.partial().extend({ description: nullableText }).meta({ id: 'UpdateContextEventTypeBody', description: 'Patch a contextual event type.' })
export type UpdateContextEventTypeBody = z.infer<typeof updateContextEventTypeBodySchema>
export const contextEventSchema = z.object({ id: uuid, event_type: contextEventTypeSchema, started_at: dateTimeSchema, ended_at: dateTimeSchema.nullable().optional(), timezone: ianaTimezoneSchema, intensity: z.number().nullable().optional(), notes: z.string().nullable().optional(), metadata: jsonObjectSchema, created_at: dateTimeSchema, updated_at: dateTimeSchema, deleted_at: dateTimeSchema.nullable().optional() }).meta({ id: 'ContextEvent', description: 'Contextual event for observational timeline analysis.' })
export type ContextEvent = z.infer<typeof contextEventSchema>
export const createContextEventBodySchema = z.object({ event_type_id: uuid, started_at: dateTimeSchema, ended_at: dateTimeSchema.optional(), timezone: ianaTimezoneSchema, intensity: z.number().optional(), notes: z.string().max(10_000).optional(), metadata: jsonObjectSchema.default({}) }).meta({ id: 'CreateContextEventBody', description: 'Create a contextual event.' })
export type CreateContextEventBody = z.infer<typeof createContextEventBodySchema>
export const updateContextEventBodySchema = createContextEventBodySchema.partial().extend({ ended_at: dateTimeSchema.nullable().optional(), intensity: z.number().nullable().optional(), notes: nullableText }).meta({ id: 'UpdateContextEventBody', description: 'Patch a contextual event.' })
export type UpdateContextEventBody = z.infer<typeof updateContextEventBodySchema>

export const pharmacologyListQuerySchema = z.object({ status: z.string().optional(), start: dateTimeSchema.optional(), end: dateTimeSchema.optional(), limit: z.coerce.number().int().min(1).max(1000).default(200) }).meta({ id: 'PharmacologyListQuery', description: 'Common pharmacology list filters.' })
export type PharmacologyListQuery = z.infer<typeof pharmacologyListQuerySchema>
export const todayQuerySchema = z.object({ timezone: ianaTimezoneSchema, date: dateSchema.optional() }).meta({ id: 'PharmacologyTodayQuery', description: 'Local date and timezone for the daily plan.' })
export type PharmacologyTodayQuery = z.infer<typeof todayQuerySchema>
export const dueStateSchema = z.enum(['not_yet_due', 'pending', 'confirmed', 'partial', 'skipped', 'unknown']).meta({ id: 'DueState', description: 'Derived confirmation state; it never creates an administration event.' })
export type DueState = z.infer<typeof dueStateSchema>
export const todayResponseSchema = z.object({ success: z.literal(true), data: z.object({ timezone: ianaTimezoneSchema, date: dateSchema, due_regimens: z.array(z.object({ regimen: regimenSchema, state: dueStateSchema, confirmed_item_ids: z.array(uuid), incomplete_item_ids: z.array(uuid) })), assessment_completion: z.array(z.object({ template_id: uuid, completed: z.boolean() })), upcoming_treatments: z.array(treatmentSessionSchema), recent_administrations: z.array(administrationEventSchema), incomplete_items: z.array(z.object({ regimen_id: uuid, item_id: uuid })) }) }).meta({ id: 'PharmacologyTodayResponse', description: 'Derived local-day plan without manufactured facts.' })
export type TodayResponse = z.infer<typeof todayResponseSchema>

export const pharmacologyTimelineQuerySchema = z.object({ start: dateTimeSchema, end: dateTimeSchema, limit: z.coerce.number().int().min(1).max(2000).default(500) }).meta({ id: 'PharmacologyTimelineQuery', description: 'UTC timestamp range for the combined pharmacology timeline.' })
export type PharmacologyTimelineQuery = z.infer<typeof pharmacologyTimelineQuerySchema>
export const pharmacologyTimelineEntrySchema = z.discriminatedUnion('type', [z.object({ type: z.literal('administration'), at: dateTimeSchema, data: administrationEventSchema }), z.object({ type: z.literal('treatment'), at: dateTimeSchema, data: treatmentSessionSchema }), z.object({ type: z.literal('assessment'), at: dateTimeSchema, data: assessmentSchema }), z.object({ type: z.literal('context'), at: dateTimeSchema, data: contextEventSchema })]).meta({ id: 'PharmacologyTimelineEntry', description: 'One factual pharmacology/recovery timeline entry.' })
export type PharmacologyTimelineEntry = z.infer<typeof pharmacologyTimelineEntrySchema>
export const pharmacologyTimelineResponseSchema = z.object({ success: z.literal(true), data: z.array(pharmacologyTimelineEntrySchema) }).meta({ id: 'PharmacologyTimelineResponse', description: 'Combined observational timeline.' })
export type PharmacologyTimelineResponse = z.infer<typeof pharmacologyTimelineResponseSchema>

export const insightsQuerySchema = z.object({ start: dateSchema.optional(), end: dateSchema.optional(), timezone: ianaTimezoneSchema }).meta({ id: 'PharmacologyInsightsQuery', description: 'Local-date range for observational data-quality insights.' })
export type InsightsQuery = z.infer<typeof insightsQuerySchema>
export const insightsResponseSchema = z.object({ success: z.literal(true), data: z.object({ range: z.object({ start: dateSchema, end: dateSchema, timezone: ianaTimezoneSchema }), coverage_days: z.number().int().nonnegative(), administration_events: z.number().int().nonnegative(), exposure_events: z.number().int().nonnegative(), concurrent_exposure_days: z.number().int().nonnegative(), missing_assessment_days: z.number().int().nonnegative(), duplicate_suspicions: z.number().int().nonnegative(), projected_metrics: z.array(z.object({ metric: z.string(), unit: z.string(), points: z.number().int().nonnegative() })), warnings: z.array(z.string()), disclaimer: z.string() }) }).meta({ id: 'PharmacologyInsightsResponse', description: 'Observational coverage and data-quality summary; never a causal or clinical conclusion.' })
export type InsightsResponse = z.infer<typeof insightsResponseSchema>

export const pharmacologyExportSchema = z.object({ exported_at: dateTimeSchema, substances: z.array(z.unknown()), substance_versions: z.array(z.unknown()), regimens: z.array(z.unknown()), regimen_items: z.array(z.unknown()), regimen_versions: z.array(z.unknown()), administration_events: z.array(z.unknown()), administration_event_revisions: z.array(z.unknown()), treatment_types: z.array(z.unknown()), treatment_sessions: z.array(z.unknown()), questionnaire_templates: z.array(z.unknown()), assessment_questions: z.array(z.unknown()), assessment_question_versions: z.array(z.unknown()), assessments: z.array(z.unknown()), assessment_responses: z.array(z.unknown()), context_event_types: z.array(z.unknown()), context_events: z.array(z.unknown()) }).meta({ id: 'PharmacologyExport', description: 'Whole-domain JSON export including correction/version history.' })
export type PharmacologyExport = z.infer<typeof pharmacologyExportSchema>
export const pharmacologyExportResponseSchema = createDataResponseSchema(pharmacologyExportSchema).meta({ id: 'PharmacologyExportResponse', description: 'Complete reconstructable pharmacology export.' })
export type PharmacologyExportResponse = z.infer<typeof pharmacologyExportResponseSchema>
export const pharmacologyCsvExportResponseSchema = z.string().meta({ id: 'PharmacologyCsvExportResponse', description: 'Tabular CSV export with one JSON row per domain record.' })
export type PharmacologyCsvExportResponse = z.infer<typeof pharmacologyCsvExportResponseSchema>

export const substanceResponseSchema = createDataResponseSchema(substanceSchema).meta({ id: 'SubstanceResponse' })
export type SubstanceResponse = z.infer<typeof substanceResponseSchema>
export const substancesResponseSchema = createDataArrayResponseSchema(substanceSchema).meta({ id: 'SubstancesResponse' })
export type SubstancesResponse = z.infer<typeof substancesResponseSchema>
export const regimenResponseSchema = createDataResponseSchema(regimenSchema).meta({ id: 'RegimenResponse' })
export type RegimenResponse = z.infer<typeof regimenResponseSchema>
export const regimensResponseSchema = createDataArrayResponseSchema(regimenSchema).meta({ id: 'RegimensResponse' })
export type RegimensResponse = z.infer<typeof regimensResponseSchema>
export const administrationResponseSchema = createDataResponseSchema(administrationEventSchema).meta({ id: 'AdministrationResponse' })
export type AdministrationResponse = z.infer<typeof administrationResponseSchema>
export const administrationsResponseSchema = createDataArrayResponseSchema(administrationEventSchema).meta({ id: 'AdministrationsResponse' })
export type AdministrationsResponse = z.infer<typeof administrationsResponseSchema>
export const confirmRegimenResponseSchema = createDataArrayResponseSchema(administrationEventSchema).meta({ id: 'ConfirmRegimenResponse' })
export type ConfirmRegimenResponse = z.infer<typeof confirmRegimenResponseSchema>
export const treatmentTypeResponseSchema = createDataResponseSchema(treatmentTypeSchema).meta({ id: 'TreatmentTypeResponse' })
export type TreatmentTypeResponse = z.infer<typeof treatmentTypeResponseSchema>
export const treatmentTypesResponseSchema = createDataArrayResponseSchema(treatmentTypeSchema).meta({ id: 'TreatmentTypesResponse' })
export type TreatmentTypesResponse = z.infer<typeof treatmentTypesResponseSchema>
export const treatmentSessionResponseSchema = createDataResponseSchema(treatmentSessionSchema).meta({ id: 'TreatmentSessionResponse' })
export type TreatmentSessionResponse = z.infer<typeof treatmentSessionResponseSchema>
export const treatmentSessionsResponseSchema = createDataArrayResponseSchema(treatmentSessionSchema).meta({ id: 'TreatmentSessionsResponse' })
export type TreatmentSessionsResponse = z.infer<typeof treatmentSessionsResponseSchema>
export const questionnaireResponseSchema = createDataResponseSchema(questionnaireTemplateSchema).meta({ id: 'QuestionnaireResponse' })
export type QuestionnaireResponse = z.infer<typeof questionnaireResponseSchema>
export const questionnairesResponseSchema = createDataArrayResponseSchema(questionnaireTemplateSchema).meta({ id: 'QuestionnairesResponse' })
export type QuestionnairesResponse = z.infer<typeof questionnairesResponseSchema>
export const assessmentResponseSchema = createDataResponseSchema(assessmentSchema).meta({ id: 'AssessmentResponse' })
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>
export const assessmentsResponseSchema = createDataArrayResponseSchema(assessmentSchema).meta({ id: 'AssessmentsResponse' })
export type AssessmentsResponse = z.infer<typeof assessmentsResponseSchema>
export const contextEventTypeResponseSchema = createDataResponseSchema(contextEventTypeSchema).meta({ id: 'ContextEventTypeResponse' })
export type ContextEventTypeResponse = z.infer<typeof contextEventTypeResponseSchema>
export const contextEventTypesResponseSchema = createDataArrayResponseSchema(contextEventTypeSchema).meta({ id: 'ContextEventTypesResponse' })
export type ContextEventTypesResponse = z.infer<typeof contextEventTypesResponseSchema>
export const contextEventResponseSchema = createDataResponseSchema(contextEventSchema).meta({ id: 'ContextEventResponse' })
export type ContextEventResponse = z.infer<typeof contextEventResponseSchema>
export const contextEventsResponseSchema = createDataArrayResponseSchema(contextEventSchema).meta({ id: 'ContextEventsResponse' })
export type ContextEventsResponse = z.infer<typeof contextEventsResponseSchema>
export const pharmacologyDeleteResponseSchema = baseResponseSchema.meta({ id: 'PharmacologyDeleteResponse', description: 'Successful archive or soft deletion.' })
export type PharmacologyDeleteResponse = z.infer<typeof pharmacologyDeleteResponseSchema>
