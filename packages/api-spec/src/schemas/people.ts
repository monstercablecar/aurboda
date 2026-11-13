import { z } from 'zod'

export const peopleRelationshipSchema = z.enum(['child', 'parent', 'lover', 'spouse', 'friend'])
const date = z.iso.date()
const strings = z.array(z.string().trim().min(1).max(200)).max(50)
export const peopleGenderIdentitySchema = z
  .enum(['woman', 'man', 'nonbinary', 'self_described', 'prefer_not_to_say'])
  .meta({ id: 'PeopleGenderIdentity' })
export const peopleGenderSchema = z
  .object({
    identity: peopleGenderIdentitySchema,
    description: z.string().trim().max(200).optional(),
    pronouns: z.string().trim().max(100).optional(),
  })
  .meta({ id: 'PeopleGender' })
export const peopleCalendarKindSchema = z
  .enum(['birthday', 'anniversary', 'celebration', 'remembrance', 'other'])
  .meta({ id: 'PeopleCalendarKind' })
const importantDateFields = z.object({
  kind: peopleCalendarKindSchema.optional(),
  id: z.uuid(),
  label: z.string().trim().min(1).max(200),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  year: z.number().int().min(1).max(9999).optional(),
  recurs_annually: z.boolean(),
  notes: z.string().max(2000).optional(),
})
export const peopleImportantDateSchema = importantDateFields
  .refine((value) => {
    const year = value.year ?? 2000
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return value.day <= days[value.month - 1] && (value.recurs_annually || value.year !== undefined)
  }, 'Choose a valid calendar date; once-only dates require a year.')
  .meta({ id: 'PeopleImportantDate' })
export const peopleImportantDateDisplaySchema = importantDateFields
  .extend({
    id: z.string(),
    source: z.enum(['derived', 'profile']),
    ideas: z.array(z.string()).optional(),
    next_occurrence: date.nullable(),
    days_until: z.number().int().nullable(),
    anniversary_number: z.number().int().nonnegative().nullable(),
  })
  .meta({ id: 'PeopleImportantDateDisplay' })
export const peopleMetSchema = z
  .object({
    place: z.string().trim().max(300).optional(),
    date: date.optional(),
    story: z.string().max(10000).optional(),
  })
  .meta({ id: 'PeopleMet' })
export const peopleStatusKindSchema = z.enum([
  'sick',
  'depressed',
  'anxious',
  'surgery_outpatient',
  'surgery_hospitalization',
  'pregnant',
  'mourning',
  'postpartum',
])
export const peopleInformationSourceSchema = z.enum(['observed', 'self_shared', 'clinical_shared'])
export const peopleStatusEpisodeSchema = z
  .object({
    id: z.uuid(),
    kind: peopleStatusKindSchema,
    lifecycle: z.enum(['active', 'resolved', 'archived']),
    start_date: date,
    estimated_end_date: date.optional(),
    resolved_date: date.optional(),
    phase: z.string().optional(),
    intensity: z.enum(['low', 'moderate', 'high']).optional(),
    preferences: z.string().max(4000).optional(),
    information_source: peopleInformationSourceSchema,
    tracking_agreed: z.boolean().optional(),
    retain_metrics: z.boolean().optional(),
    estimated_due_date: date.optional(),
    gestational_age_days: z.number().int().min(0).max(315).optional(),
    gestational_as_of: date.optional(),
    outcome: z.enum(['birth', 'loss', 'other', 'undisclosed']).optional(),
    previous_episode_id: z.uuid().optional(),
    transition_history: z
      .array(
        z.object({
          from: z.enum(['active', 'resolved', 'archived']),
          to: z.enum(['active', 'resolved', 'archived']),
          date,
          previous_outcome: z.enum(['birth', 'loss', 'other', 'undisclosed']).optional(),
          previous_resolved_date: date.optional(),
        }),
      )
      .optional(),
  })
  .meta({ id: 'PeopleStatusEpisode' })
const careOption = z.object({ value: z.string(), label: z.string() })
export const peopleStatusDefinitionSchema = z
  .object({
    kind: peopleStatusKindSchema,
    label: z.string(),
    description: z.string(),
    phases: z.array(careOption),
    supports_intensity: z.boolean(),
    metric_ids: z.array(z.string()),
    transition_kinds: z.array(peopleStatusKindSchema),
  })
  .meta({ id: 'PeopleStatusDefinition' })
export const peopleCareMetricDefinitionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    status_kinds: z.array(peopleStatusKindSchema),
    value_kind: z.enum(['count', 'note', 'rating', 'state']),
    unit: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    states: z.array(careOption).optional(),
    sensitive: z.boolean(),
    allowed_sources: z.array(peopleInformationSourceSchema),
  })
  .meta({ id: 'PeopleCareMetricDefinition' })
const episodeWindow = {
  phases: z.array(z.string()).optional(),
  min_duration_days: z.number().int().nonnegative().optional(),
  max_duration_days: z.number().int().nonnegative().optional(),
  min_gestational_days: z.number().int().nonnegative().optional(),
  max_gestational_days: z.number().int().nonnegative().optional(),
}
export const peopleCareMilestoneDefinitionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status_kind: peopleStatusKindSchema,
    ...episodeWindow,
    evidence_ids: z.array(z.string()),
  })
  .meta({ id: 'PeopleCareMilestoneDefinition' })
export const peopleStatusConditionsSchema = z.object({
  all: z.array(peopleStatusKindSchema).optional(),
  any: z.array(peopleStatusKindSchema).optional(),
  exclude: z.array(peopleStatusKindSchema).optional(),
  episode: z.object({ kind: peopleStatusKindSchema, ...episodeWindow }).optional(),
})
export const peopleCareEthicsSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    principles: z.array(z.string()),
    evidence_ids: z.array(z.string()),
  })
  .meta({ id: 'PeopleCareEthics' })
export const peopleStatusContextSchema = z
  .object({
    episode_id: z.uuid(),
    kind: peopleStatusKindSchema,
    label: z.string(),
    lifecycle: z.enum(['active', 'resolved', 'archived']),
    elapsed_days: z.number().int(),
    phase: z.string().optional(),
    gestational_days: z.number().int().nullable(),
    gestational_weeks: z.number().nullable(),
    timing_basis: z.string(),
    tracking_available: z.boolean(),
  })
  .meta({ id: 'PeopleStatusContext' })
export const peopleCareMilestoneSchema = z
  .object({
    definition_id: z.string(),
    status_episode_id: z.uuid(),
    title: z.string(),
    description: z.string(),
    window_label: z.string(),
    state: z.enum(['upcoming', 'available', 'recorded', 'past_window', 'timing_unknown']),
    timing_date: date.optional(),
    evidence_ids: z.array(z.string()),
    recorded_event_id: z.uuid().optional(),
  })
  .meta({ id: 'PeopleCareMilestone' })
export type PeopleStatusKind = z.infer<typeof peopleStatusKindSchema>
export type PeopleStatusEpisode = z.infer<typeof peopleStatusEpisodeSchema>
export type PeopleStatusDefinition = z.infer<typeof peopleStatusDefinitionSchema>
export type PeopleCareMetricDefinition = z.infer<typeof peopleCareMetricDefinitionSchema>
export type PeopleCareMilestoneDefinition = z.infer<typeof peopleCareMilestoneDefinitionSchema>
export type PeopleStatusContext = z.infer<typeof peopleStatusContextSchema>
export type PeopleCareMilestone = z.infer<typeof peopleCareMilestoneSchema>
export type PeopleCareEthics = z.infer<typeof peopleCareEthicsSchema>
export const personFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    relationship: peopleRelationshipSchema,
    preferred_name: z.string().max(200).nullable().optional(),
    photo: z
      .string()
      .max(500000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
    date_of_birth: date.nullable().optional(),
    gender: peopleGenderSchema.nullable().optional(),
    met: peopleMetSchema.nullable().optional(),
    important_dates: z
      .array(peopleImportantDateSchema)
      .max(50)
      .refine(
        (values) => new Set(values.map((v) => v.id.toLowerCase())).size === values.length,
        'Important date identifiers must be unique.',
      )
      .optional(),
    approximate_age: z
      .object({
        value: z.number().int().min(0).max(15000),
        unit: z.enum(['days', 'months', 'years']),
        as_of: date,
      })
      .nullable()
      .optional(),
    corrected_age_weeks: z.number().int().min(0).max(20).default(0),
    needs: strings.min(1),
    statuses: strings.default([]),
    status_episodes: z.array(peopleStatusEpisodeSchema).max(100).optional(),
    goals: strings.default([]),
    interests: strings.default([]),
    notes: z.string().max(10000).default(''),
    enabled_metrics: strings.default([]),
    hidden_modules: strings.default([]),
  })
  .meta({ id: 'PersonFields', description: 'Private person profile and explicit tracking preferences.' })
export const createPersonBodySchema = personFieldsSchema
  .refine(
    (p) => Boolean(p.date_of_birth) !== Boolean(p.approximate_age),
    'Supply either date of birth or approximate age',
  )
  .meta({ id: 'CreatePersonBody' })
export const updatePersonBodySchema = personFieldsSchema
  .partial()
  .extend({
    expected_updated_at: z.iso.datetime({ offset: true }).optional(),
    corrected_age_weeks: personFieldsSchema.shape.corrected_age_weeks.removeDefault().optional(),
    statuses: personFieldsSchema.shape.statuses.removeDefault().optional(),
    goals: personFieldsSchema.shape.goals.removeDefault().optional(),
    interests: personFieldsSchema.shape.interests.removeDefault().optional(),
    notes: personFieldsSchema.shape.notes.removeDefault().optional(),
    enabled_metrics: personFieldsSchema.shape.enabled_metrics.removeDefault().optional(),
    hidden_modules: personFieldsSchema.shape.hidden_modules.removeDefault().optional(),
  })
  .meta({ id: 'UpdatePersonBody' })
export const personSchema = personFieldsSchema
  .extend({ id: z.uuid(), created_at: z.iso.datetime(), updated_at: z.iso.datetime() })
  .meta({ id: 'Person' })
export const peopleSourceSchema = z
  .object({
    id: z.string(),
    verification_method: z.enum(['full_page', 'official_indexed_excerpt']).optional(),
    publisher: z.string(),
    title: z.string(),
    url: z.url(),
    publication_date: z.string().optional(),
    review_date: z.string().optional(),
    last_verified: z.string(),
    applicable_population: z.string(),
    evidence_category: z.string(),
    limitations: z.array(z.string()),
    licensing_status: z.string(),
    official_quote: z.object({ text: z.string(), section: z.string() }).optional(),
  })
  .meta({ id: 'PeopleSource' })
export const peopleGuidanceSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    relationship_types: z.array(peopleRelationshipSchema),
    genders: z.array(peopleGenderIdentitySchema).optional(),
    child_section: z.enum(['play', 'watch', 'safety', 'help']).optional(),
    min_age: z.number().nonnegative(),
    max_age: z.number().positive(),
    age_unit: z.enum(['days', 'months', 'years']),
    needs: strings,
    statuses: strings,
    domains: strings,
    priority: z.number(),
    guidance_type: z.enum([
      'safety',
      'development',
      'optimization',
      'relationship',
      'care',
      'prevention',
      'resource',
    ]),
    status_conditions: peopleStatusConditionsSchema.optional(),
    log_condition: z
      .object({
        care_metric: z.literal('support_need'),
        within_days: z.number().positive(),
        state: z.enum(['requested', 'not_requested', 'unsure']),
        min_count: z.number().int().positive().optional(),
      })
      .optional(),
    dedupe_key: z.string().optional(),
    review: z
      .object({
        reviewed_on: date,
        claim_type: z.enum(['clinical', 'developmental', 'practical', 'ethical']),
        individualized_judgment: z.boolean(),
        empathy_review: z.object({ reviewed_on: date, notes: z.string() }),
      })
      .optional(),
    summary: z.string(),
    practical_actions: z.array(z.string()),
    optional_metrics: strings,
    evidence_ids: strings,
    evidence_class: z.string(),
    contraindications: strings,
    review_interval: z.number().positive(),
    version: z.string(),
    last_verified: z.string(),
    jurisdiction: z.string(),
    active: z.boolean(),
    checklist_age_months: z.number().optional(),
    evidence_comparison: z
      .enum([
        'complementary',
        'consistent',
        'different_scope',
        'different_population',
        'potentially_conflicting',
        'not_directly_comparable',
      ])
      .optional(),
    interests: strings.default([]),
    goals: strings.default([]),
    recurring: z.boolean().default(true),
  })
  .meta({ id: 'PeopleGuidance' })
export const matchedPeopleGuidanceSchema = peopleGuidanceSchema
  .extend({ reasons: z.array(z.string()), feedback: z.enum(['dismissed', 'completed']).optional() })
  .meta({ id: 'MatchedPeopleGuidance' })
export const peopleEventBodySchema = z
  .object({
    type: z.enum([
      'contact',
      'shared_activity',
      'care',
      'sleep',
      'feeding',
      'diaper',
      'growth',
      'observation',
      'appointment',
      'goal',
      'reflection',
      'journal',
      'memory',
    ]),
    timestamp: z.iso.datetime({ offset: true }),
    end_time: z.iso.datetime({ offset: true }).nullable().optional(),
    reminder_at: z.iso.datetime({ offset: true }).nullable().optional(),
    reminder_timezone: z.string().min(1).max(100).nullable().optional(),
    payload: z
      .object({
        status_episode_id: z.uuid().optional(),
        care_metric: z.string().optional(),
        milestone_id: z.string().optional(),
        information_source: peopleInformationSourceSchema.optional(),
        care_state: z.enum(['requested', 'not_requested', 'unsure']).optional(),
        guidance_version: z.string().optional(),
        observation_age_days: z.number().optional(),
        note: z.string().max(10000).optional(),
        title: z.string().trim().max(200).optional(),
        goal_status: z.enum(['active', 'completed', 'paused']).optional(),
        target_date: date.optional(),
        location: z.string().trim().max(300).optional(),
        measurement_type: z.enum(['weight', 'length', 'head_circumference']).optional(),
        diaper_type: z.enum(['wet', 'dirty', 'mixed']).optional(),
        value: z.number().finite().optional(),
        unit: z.string().max(30).optional(),
        observation: z
          .enum(['observed', 'not_observed', 'unsure', 'not_reviewed', 'goal', 'concern'])
          .optional(),
        guidance_id: z.string().optional(),
        time_kind: z.enum(['engaged', 'caregiving', 'presence']).optional(),
      })
      .default({}),
    source: z.literal('manual').default('manual'),
  })
  .meta({ id: 'PeopleEventBody' })
export const updatePeopleEventBodySchema = peopleEventBodySchema
  .partial()
  .extend({
    payload: peopleEventBodySchema.shape.payload.removeDefault().optional(),
    source: peopleEventBodySchema.shape.source.removeDefault().optional(),
  })
  .meta({ id: 'UpdatePeopleEventBody' })
export const peopleEventSchema = peopleEventBodySchema
  .extend({
    type: z.enum([...peopleEventBodySchema.shape.type.options, 'relationship_state']),
    source: z.enum(['manual', 'system']),
    payload: peopleEventBodySchema.shape.payload.removeDefault().extend({
      relationship_state: z.string().optional(),
      relationship_state_change: z.enum(['started', 'ended']).optional(),
      relationship_state_started_at: z.iso.datetime({ offset: true }).nullable().optional(),
    }),
    id: z.uuid(),
    person_id: z.uuid(),
    actor: z.string(),
    recorded_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    privacy: z.literal('private'),
    revision: z.number().int(),
  })
  .meta({ id: 'PeopleEvent' })
export const peopleFeedbackBodySchema = z
  .object({ action: z.enum(['dismissed', 'completed']), version: z.string() })
  .meta({ id: 'PeopleFeedbackBody' })
export const peopleMetricSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    unit: z.string(),
    event_type: peopleEventBodySchema.shape.type,
    status_episode_id: z.uuid().optional(),
    care_metric: z.string().optional(),
    enabled: z.boolean(),
    value: z.number().nullable(),
    display_value: z.string().optional(),
    window: z.enum(['all_time', 'last_24_hours', 'last_7_days', 'latest', 'current_state']).optional(),
    window_label: z.string().optional(),
    last_recorded_at: z.iso.datetime({ offset: true }).nullable().optional(),
    window_start: z.iso.datetime({ offset: true }).optional(),
    window_end: z.iso.datetime({ offset: true }).optional(),
    description: z.string(),
  })
  .meta({ id: 'PeopleMetric' })
export const peopleContextSchema = z
  .object({
    age_days: z.number(),
    age_months: z.number(),
    age_years: z.number(),
    developmental_age_months: z.number(),
    age_display: z.string(),
    life_stage: z.string(),
    focus: z.string(),
    approximate: z.boolean(),
    previous_checklist_months: z.number().nullable(),
    next_checklist_months: z.number().nullable(),
  })
  .meta({ id: 'PeopleContext' })
export const peopleModuleSchema = z
  .object({ id: z.string(), title: z.string(), description: z.string(), hideable: z.boolean() })
  .meta({ id: 'PeopleModule' })
export const peopleDashboardSchema = z
  .object({
    status_contexts: z.array(peopleStatusContextSchema).optional(),
    status_guidance: z.array(matchedPeopleGuidanceSchema).optional(),
    care_milestones: z.array(peopleCareMilestoneSchema).optional(),
    care_ethics: peopleCareEthicsSchema.optional(),
    person: personSchema,
    context: peopleContextSchema,
    modules: z.array(peopleModuleSchema),
    available_modules: z.array(peopleModuleSchema),
    metrics: z.array(peopleMetricSchema),
    current_guidance: z.array(matchedPeopleGuidanceSchema),
    contextual_guidance: z.array(matchedPeopleGuidanceSchema),
    child_guide: z
      .object({
        title: z.string(),
        introduction: z.string(),
        groups: z.array(
          z.object({
            id: z.enum(['play', 'watch', 'safety', 'help']),
            title: z.string(),
            description: z.string(),
            records: z.array(matchedPeopleGuidanceSchema),
          }),
        ),
      })
      .nullable()
      .optional(),
    important_dates: z.array(peopleImportantDateDisplaySchema),
    practical_opportunities: z.array(matchedPeopleGuidanceSchema),
    developmental_context: z.array(matchedPeopleGuidanceSchema),
    upcoming: z.array(peopleGuidanceSchema),
    recent_activity: z.array(peopleEventSchema),
    goals: z.array(peopleEventSchema),
    upcoming_events: z.array(peopleEventSchema),
    sources: z.array(peopleSourceSchema),
    shared_time_minutes: z.number(),
    guidance_count: z.number(),
    event_types: z.array(z.object({ value: z.string(), label: z.string() })),
    reminders_available: z.boolean(),
  })
  .meta({ id: 'PeopleDashboard' })
const option = z.object({ value: z.string(), label: z.string() })
export const peopleCalendarQuerySchema = z
  .object({ from: date, to: date })
  .refine((query) => {
    const span = (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86400000
    return span >= 0 && span < 3660
  }, 'Choose an ordered date range of at most 3660 days, including both endpoints.')
  .meta({ id: 'PeopleCalendarQuery' })
export const peopleCalendarOccurrenceSchema = z
  .object({
    id: z.string(),
    person_id: z.uuid(),
    person_name: z.string(),
    date_id: z.string(),
    label: z.string(),
    date,
    start_time: z.iso.datetime({ offset: true }),
    end_time: z.iso.datetime({ offset: true }),
    source: z.enum(['derived', 'profile']),
    kind: peopleCalendarKindSchema,
    anniversary_number: z.number().int().nonnegative().nullable(),
    ideas: z.array(z.string()),
  })
  .meta({ id: 'PeopleCalendarOccurrence' })
export const peopleOptionsSchema = z
  .object({
    status_definitions: z.array(peopleStatusDefinitionSchema).optional(),
    care_metric_definitions: z.array(peopleCareMetricDefinitionSchema).optional(),
    topics: z.array(option),
    genders: z.array(option),
    goal_statuses: z.array(option),
    measurement_types: z.array(option).optional(),
    diaper_types: z.array(option).optional(),
    date_kinds: z.array(option),
    event_fields: z.record(z.string(), z.array(z.string())),
    observation_states: z.array(option),
    time_kinds: z.array(option),
    guidance_types: z.array(option),
    life_stages: z.array(option),
    relationships: z.array(option),
    needs: z.record(z.string(), z.array(option)),
    statuses: z.array(option.extend({ relationship_types: z.array(peopleRelationshipSchema).optional() })),
    event_types: z.array(option),
    age_units: z.array(option),
  })
  .meta({ id: 'PeopleOptions' })
export const peopleGuidanceQuerySchema = z
  .object({
    topic: z.string().optional(),
    life_stage: z.string().optional(),
    relationship: peopleRelationshipSchema.optional(),
    guidance_type: peopleGuidanceSchema.shape.guidance_type.optional(),
    source: z.string().optional(),
  })
  .meta({ id: 'PeopleGuidanceQuery' })
const response = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.boolean(), data: data.optional(), error: z.string().optional() })
export const peopleCalendarResponseSchema = response(z.array(peopleCalendarOccurrenceSchema)).meta({
  id: 'PeopleCalendarResponse',
})
export const personResponseSchema = response(personSchema).meta({ id: 'PersonResponse' })
export const peopleResponseSchema = response(z.array(personSchema)).meta({ id: 'PeopleResponse' })
export const peopleDashboardResponseSchema = response(peopleDashboardSchema).meta({
  id: 'PeopleDashboardResponse',
})
export const peopleEventsResponseSchema = response(z.array(peopleEventSchema)).meta({
  id: 'PeopleEventsResponse',
})
export const peopleEventResponseSchema = response(peopleEventSchema).meta({ id: 'PeopleEventResponse' })
export const peopleGuidanceResponseSchema = response(z.array(matchedPeopleGuidanceSchema)).meta({
  id: 'PeopleGuidanceResponse',
})
export const peopleSourcesResponseSchema = response(z.array(peopleSourceSchema)).meta({
  id: 'PeopleSourcesResponse',
})
export const peopleOptionsResponseSchema = response(peopleOptionsSchema).meta({ id: 'PeopleOptionsResponse' })
export const peopleMetricsResponseSchema = response(z.array(peopleMetricSchema)).meta({
  id: 'PeopleMetricsResponse',
})
export const peopleMutationResponseSchema = response(z.object({ id: z.string() })).meta({
  id: 'PeopleMutationResponse',
})
export type Person = z.infer<typeof personSchema>
export type CreatePersonBody = z.infer<typeof createPersonBodySchema>
export type UpdatePersonBody = z.infer<typeof updatePersonBodySchema>
export type PeopleSource = z.infer<typeof peopleSourceSchema>
export type PeopleGuidance = z.infer<typeof peopleGuidanceSchema>
export type MatchedPeopleGuidance = z.infer<typeof matchedPeopleGuidanceSchema>
export type PeopleEventBody = z.infer<typeof peopleEventBodySchema>
export type UpdatePeopleEventBody = z.infer<typeof updatePeopleEventBodySchema>
export type PeopleEvent = z.infer<typeof peopleEventSchema>
export type PeopleFeedbackBody = z.infer<typeof peopleFeedbackBodySchema>
export type PeopleMetric = z.infer<typeof peopleMetricSchema>
export type PeopleContext = z.infer<typeof peopleContextSchema>
export type PeopleModule = z.infer<typeof peopleModuleSchema>
export type PeopleDashboard = z.infer<typeof peopleDashboardSchema>
export type PeopleOptions = z.infer<typeof peopleOptionsSchema>
export type PeopleGuidanceQuery = z.infer<typeof peopleGuidanceQuerySchema>
export type PersonResponse = z.infer<typeof personResponseSchema>
export type PeopleResponse = z.infer<typeof peopleResponseSchema>
export type PeopleDashboardResponse = z.infer<typeof peopleDashboardResponseSchema>
export type PeopleEventsResponse = z.infer<typeof peopleEventsResponseSchema>
export type PeopleEventResponse = z.infer<typeof peopleEventResponseSchema>
export type PeopleGuidanceResponse = z.infer<typeof peopleGuidanceResponseSchema>
export type PeopleSourcesResponse = z.infer<typeof peopleSourcesResponseSchema>
export type PeopleOptionsResponse = z.infer<typeof peopleOptionsResponseSchema>
export type PeopleMetricsResponse = z.infer<typeof peopleMetricsResponseSchema>
export type PeopleMutationResponse = z.infer<typeof peopleMutationResponseSchema>

export type PeopleGender = z.infer<typeof peopleGenderSchema>
export type PeopleImportantDate = z.infer<typeof peopleImportantDateSchema>
export type PeopleImportantDateDisplay = z.infer<typeof peopleImportantDateDisplaySchema>
export type PeopleMet = z.infer<typeof peopleMetSchema>

export type PeopleCalendarKind = z.infer<typeof peopleCalendarKindSchema>
export type PeopleCalendarOccurrence = z.infer<typeof peopleCalendarOccurrenceSchema>
export type PeopleCalendarQuery = z.infer<typeof peopleCalendarQuerySchema>
export type PeopleCalendarResponse = z.infer<typeof peopleCalendarResponseSchema>

export const peopleHelpTreeQuerySchema = z.object({ person_id: z.uuid().optional() })
export const peopleHelpTreeSchema = z
  .object({
    age_policy: z.string().optional(),
    guidance: z.array(peopleGuidanceSchema),
    sources: z.array(peopleSourceSchema),
    status_definitions: z.array(peopleStatusDefinitionSchema),
    care_metric_definitions: z.array(peopleCareMetricDefinitionSchema),
    milestone_definitions: z.array(peopleCareMilestoneDefinitionSchema),
    care_ethics: peopleCareEthicsSchema,
    evaluations: z
      .array(z.object({ guidance_id: z.string(), applicable: z.boolean(), reasons: z.array(z.string()) }))
      .optional(),
  })
  .meta({ id: 'PeopleHelpTree' })
export const peopleHelpTreeResponseSchema = response(peopleHelpTreeSchema).meta({
  id: 'PeopleHelpTreeResponse',
})
export type PeopleHelpTree = z.infer<typeof peopleHelpTreeSchema>
export type PeopleHelpTreeQuery = z.infer<typeof peopleHelpTreeQuerySchema>
export type PeopleHelpTreeResponse = z.infer<typeof peopleHelpTreeResponseSchema>
