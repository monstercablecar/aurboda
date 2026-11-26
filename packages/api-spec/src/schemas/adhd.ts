import { z } from 'zod'

import { iso8601DateTimeSchema as instant, baseResponseSchema } from './common.ts'

const text = z.string().trim().min(1).max(500)
const uuid = z.string().uuid()
export const adhdItemSchema = z
  .object({
    id: text,
    version: z.literal(1),
    prompt: text,
    anchors: z.array(z.string()).min(2).max(5),
    construct: text,
    recall: text,
    applicability: text,
    decision: text,
  })
  .meta({ id: 'AdhdItem', description: 'Immutable custom tracking item; not a validated clinical scale.' })
export const adhdItemsSchema = z
  .record(
    z.string(),
    z
      .object({
        status: z.enum(['answered', 'skipped', 'not_asked', 'not_applicable']),
        value: z.union([z.number(), z.boolean(), z.string().max(2000), z.array(z.string())]).optional(),
      })
      .superRefine((item, ctx) => {
        if ((item.status === 'answered') !== (item.value !== undefined)) {
          ctx.addIssue({ code: 'custom', message: 'Only answered items have a value' })
        }
      }),
  )
  .meta({ id: 'AdhdItems', description: 'Per-item explicit missingness; zero and false are values.' })
export const adhdContextSchema = z
  .object({
    target: z.string().trim().max(300).default(''),
    task_id: uuid.optional(),
    project_id: uuid.optional(),
    phase: z.enum(['pre_start', 'ongoing', 'after', 'none']).default('none'),
    task_class: z.string().max(100).default(''),
    context: z.enum(['work', 'leave', 'care', 'recovery', 'connection', 'play', 'other']).default('other'),
    journal_id: uuid.optional(),
    main_sleep_id: uuid.optional(),
    main_sleep_confirmed: z.boolean().default(false),
  })
  .meta({ id: 'AdhdContext', description: 'Same target snapshot for interest/ease. No task is created.' })
export const adhdObservationInputSchema = z
  .object({
    observed_at: instant,
    timezone: text,
    original_offset: z.string().optional(),
    precision: z.enum(['minute', 'hour', 'date', 'uncertain']).default('minute'),
    scope: z.enum(['current', 'day', 'retrospective']).default('current'),
    sampling: z
      .enum([
        'self_initiated',
        'help_request',
        'experiment_baseline',
        'experiment_outcome',
        'scheduled',
        'retrospective',
        'imported',
      ])
      .default('self_initiated'),
    pack: z.enum(['tiny_state', 'tiny_task', 'core', 'full', 'core_strain', 'outcome', 'focused']),
    expected_instrument_version: z.literal('adhd_custom_v1'),
    context: adhdContextSchema,
    items: adhdItemsSchema,
    user_tags: z.array(z.string().max(80)).max(8).default([]),
    invitation_id: uuid.optional(),
  })
  .meta({
    id: 'AdhdObservationInput',
    description: 'Private canonical check-in plus semantic metadata, atomically saved.',
  })
export const adhdSettingsSchema = z
  .object({
    paused: z.boolean().default(false),
    reminders_enabled: z.boolean().default(false),
    timezone: z.string().default('America/Denver'),
    prompt_times: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
      .max(3)
      .default(['12:30']),
    daily_budget: z.number().int().min(1).max(3).default(2),
    quiet_start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('21:00'),
    quiet_end: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('09:00'),
    novelty: z.enum(['off', 'curiosity', 'acknowledgement']).default('off'),
    low_stimulation: z.boolean().default(true),
  })
  .meta({ id: 'AdhdSettings', description: 'Private burden and opt-in reminders; disabled initially.' })
export const adhdProtocolInputSchema = z
  .object({
    kind: z.enum(['prepared_starter', 'stopping_cue']),
    hypothesis_id: uuid.optional(),
    task_class: text,
    timezone: text,
    days: z.union([z.literal(7), z.literal(14)]).default(7),
    awake_start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('09:00'),
    awake_end: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('20:00'),
    benefit_threshold: z.number().min(0).max(10).default(2),
    strain_guardrail: z.boolean().default(true),
    acceptable_conditions: z.literal(true),
    burden_seconds: z.number().int().min(10).max(120).default(60),
  })
  .meta({
    id: 'AdhdProtocolInput',
    description: 'Explicit opt-in immutable feasibility pilot; never medication or sleep manipulation.',
  })
export const adhdHypothesisInputSchema = z
  .object({
    statement: text,
    claim: z.enum(['descriptive', 'causal']),
    required_measures: z.array(text).max(12),
    prediction: text,
    alternatives: text,
    weakening_evidence: text,
    eligible_context: text,
    next_test: text,
    status: z.enum([
      'Untested',
      'Observing',
      'Testing',
      'Inconclusive',
      'Tentative support',
      'Mixed',
      'Weakened',
    ]),
    evidence: z
      .array(
        z.object({
          source: z.enum(['observation', 'opportunity', 'legacy_assessment', 'journal']),
          id: uuid,
          note: z.string().max(500).optional(),
        }),
      )
      .max(30)
      .default([]),
  })
  .meta({
    id: 'AdhdHypothesisInput',
    description: 'Editable versioned personal hypothesis with private source references.',
  })
const cas = { id: uuid, expected_revision: z.number().int().positive() }
export const adhdCommandSchema = z
  .discriminatedUnion('operation', [
    z.object({
      operation: z.literal('settings'),
      expected_revision: z.number().int().nonnegative(),
      settings: adhdSettingsSchema,
    }),
    z.object({ operation: z.literal('observe'), observation: adhdObservationInputSchema }),
    z.object({
      operation: z.literal('session'),
      recipe_id: uuid.optional(),
      context: adhdContextSchema,
      endpoint: text,
      strategy_id: text,
      estimated_minutes: z.number().min(1).max(240).optional(),
    }),
    z.object({ operation: z.literal('protocol'), protocol: adhdProtocolInputSchema }),
    z.object({
      operation: z.literal('protocol_status'),
      ...cas,
      status: z.enum(['paused', 'withdrawn', 'completed']),
    }),
    z.object({
      operation: z.literal('opportunity'),
      protocol_id: uuid,
      expected_protocol_revision: z.number().int().positive(),
      context: adhdContextSchema,
      endpoint: text,
      ten_minutes: z.boolean(),
      safe_interruptible: z.boolean(),
      either_acceptable: z.boolean(),
      availability: z.enum(['eligible', 'unavailable', 'declined']),
      baseline: adhdObservationInputSchema.optional(),
      estimated_minutes: z.number().min(1).max(240).optional(),
    }),
    z.object({
      operation: z.literal('expose'),
      ...cas,
      displayed_at: instant,
      uncertainty: z.enum(['interface_acknowledged', 'delayed_or_uncertain']),
    }),
    z.object({
      operation: z.literal('method'),
      ...cas,
      accepted: z.boolean().nullable(),
      used: z.enum(['prepared_starter', 'usual', 'stopping_cue', 'other', 'none', 'unrecorded']),
      declined: z.boolean(),
      starter: z.string().max(500).optional(),
    }),
    z.object({
      operation: z.literal('outcome'),
      ...cas,
      start: z.enum(['yes', 'no', 'unknown']),
      within_five_minutes: z.enum(['yes', 'no', 'unknown']),
      latency: z.enum(['under_1_min', '1_to_5_min', 'over_5_min', 'unknown']).default('unknown'),
      started_at: instant.optional(),
      ended_at: instant.optional(),
      time_precision: z.enum(['minute', 'approximate', 'unknown']).default('unknown'),
      interruption: z.enum(['none', 'before_start', 'after_start', 'unknown']),
      other_action: z.enum(['none', 'rest', 'connection', 'play', 'another_task', 'unknown']),
      endpoint: z.enum(['yes', 'partly', 'no', 'interrupted', 'not_applicable', 'unknown']),
      overrun_minutes: z.number().min(0).max(1440).optional(),
      effort: z.number().int().min(1).max(5).optional(),
      usefulness: z.number().int().min(1).max(5).optional(),
      reuse: z.enum(['yes', 'no', 'unsure']).optional(),
      strain: z.number().int().min(1).max(5).optional(),
      notes: z.string().max(1000).optional(),
    }),
    z.object({
      operation: z.literal('hypothesis'),
      id: uuid.optional(),
      expected_revision: z.number().int().positive().optional(),
      hypothesis: adhdHypothesisInputSchema,
    }),
    z.object({
      operation: z.literal('recipe'),
      title: text,
      barrier: text,
      strategy_id: text,
      steps: text,
      stopping_rule: text,
    }),
    z.object({
      operation: z.literal('review'),
      mattered: text,
      helped: text,
      difficult: text,
      tracking_worthwhile: z.enum(['yes', 'no', 'unsure']),
      next: text,
    }),
    z.object({ operation: z.literal('invitation'), ...cas, action: z.enum(['opened', 'skip', 'snooze']) }),
    z.object({
      operation: z.literal('delete'),
      ...cas,
      kind: z.enum(['observation', 'protocol', 'hypothesis', 'recipe', 'review', 'opportunity']),
    }),
  ])
  .meta({
    id: 'AdhdCommand',
    description: 'Explicit user action, account-scoped. Stable request_id required across uncertain retries.',
  })
export const adhdCommandBodySchema = z
  .object({ request_id: uuid, command: adhdCommandSchema })
  .meta({ id: 'AdhdCommandBody' })
export type AdhdCommandBody = z.infer<typeof adhdCommandBodySchema>
export type AdhdCommand = z.infer<typeof adhdCommandSchema>
export type AdhdSettings = z.infer<typeof adhdSettingsSchema>
export type AdhdContext = z.infer<typeof adhdContextSchema>
export type AdhdObservationInput = z.infer<typeof adhdObservationInputSchema>
export type AdhdProtocolInput = z.infer<typeof adhdProtocolInputSchema>
export type AdhdHypothesisInput = z.infer<typeof adhdHypothesisInputSchema>
export type AdhdItem = z.infer<typeof adhdItemSchema>
export const adhdRecordSchema = z
  .object({
    id: uuid,
    parent_id: uuid.nullable().optional(),
    kind: text,
    revision: z.number().int(),
    data: z.record(z.string(), z.unknown()),
    created_at: instant,
    updated_at: instant,
  })
  .meta({
    id: 'AdhdRecord',
    description: 'Versioned domain record; immutable protocol snapshot and independent attempt dimensions.',
  })
export const adhdObservationSchema = adhdObservationInputSchema
  .extend({
    id: uuid,
    answer_id: uuid,
    revision: z.number().int(),
    recorded_at: instant,
    metric_outputs: z.record(z.string(), z.object({ metric: z.string(), time: instant })).optional(),
    answers: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.array(z.string())])),
  })
  .meta({ id: 'AdhdObservation' })
export type AdhdObservation = z.infer<typeof adhdObservationSchema>
export type AdhdRecord = z.infer<typeof adhdRecordSchema>
export const adhdStrategySchema = z
  .object({
    id: text,
    version: z.literal(1),
    title: text,
    barriers: z.array(text),
    setup: text,
    steps: z.array(text),
    benefit: text,
    cost: text,
    evidence: text,
    sources: z.array(z.string()),
    pack: z.string(),
  })
  .meta({ id: 'AdhdStrategy' })
export type AdhdStrategy = z.infer<typeof adhdStrategySchema>
export const adhdStateSchema = z
  .object({
    settings: adhdSettingsSchema,
    settings_revision: z.number().int(),
    records: z.array(adhdRecordSchema),
    observations: z.array(adhdObservationSchema),
    items: z.array(adhdItemSchema),
    strategies: z.array(adhdStrategySchema),
    hypotheses: z.array(adhdHypothesisInputSchema),
    legacy: z.array(
      z.object({
        source: z.string(),
        id: uuid,
        template_id: uuid,
        version: z.number(),
        observed_at: instant,
        time_scope: text,
        answers: z.record(z.string(), z.unknown()),
      }),
    ),
  })
  .meta({
    id: 'AdhdState',
    description: 'Private account ADHD state, canonical answers and source-separated legacy history.',
  })
export type AdhdState = z.infer<typeof adhdStateSchema>
export const adhdResponseSchema = baseResponseSchema
  .extend({ data: adhdStateSchema.optional(), result_id: uuid.optional() })
  .meta({ id: 'AdhdResponse' })
export type AdhdResponse = z.infer<typeof adhdResponseSchema>
