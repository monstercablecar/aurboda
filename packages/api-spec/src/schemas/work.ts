import { z } from 'zod'

const stableIdSchema = z.string().min(1).meta({ description: 'Stable Work profile identifier' })

const workPositionLabelSchema = z
  .object({
    deckhand: z.string().min(1).meta({ description: 'Label for the Deckhand column' }),
    dishwasher: z.string().min(1).meta({ description: 'Label for the Dishwasher column' }),
    housekeeper: z.string().min(1).meta({ description: 'Label for the Housekeeper column' }),
    server: z.string().min(1).meta({ description: 'Label for the Server column' }),
  })
  .meta({ id: 'WorkPositionLabels', description: 'Legacy Recruiting position labels' })

export type WorkPositionLabels = z.infer<typeof workPositionLabelSchema>

export const workLabelHistorySchema = z
  .object({
    changed_at: z.iso.datetime().optional().meta({ description: 'When the cosmetic label changed' }),
    label: z.string().min(1).meta({ description: 'Previous cosmetic label' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkLabelHistory', description: 'Historical cosmetic label value for a Work profile entity' })

export const workNameHistorySchema = z
  .object({
    changed_at: z.iso.datetime().optional().meta({ description: 'When the cosmetic name changed' }),
    name: z.string().min(1).meta({ description: 'Previous cosmetic name' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkNameHistory', description: 'Historical cosmetic profile name value' })

export const workStorageContractSchema = z
  .object({
    daily_metric_source: z
      .string()
      .min(1)
      .meta({ description: 'Metric source used for daily Work metric samples' }),
    day_marker_metric: z.string().min(1).meta({ description: 'Metric marking a completed Work day' }),
    event_activity_type: z
      .string()
      .min(1)
      .optional()
      .meta({ description: 'Optional future activity type for timestamped Work events' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkStorageContract', description: 'Storage identities a Work profile writes and reads' })

export const workCategoryColumnSchema = z
  .object({
    archived_at: z.iso.datetime().optional().meta({ description: 'When this category column was archived' }),
    hidden: z.boolean().meta({ description: 'Whether the category column is hidden from current entry UI' }),
    id: stableIdSchema.meta({ description: 'Stable category column identifier' }),
    label: z.string().min(1).meta({ description: 'Current cosmetic category column label' }),
    label_history: z
      .array(workLabelHistorySchema)
      .meta({ description: 'Previous cosmetic labels for this category column' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkCategoryColumn', description: 'Ordered category column in a Work profile' })

export const workMetricRowSchema = z
  .object({
    archived_at: z.iso.datetime().optional().meta({ description: 'When this metric row was archived' }),
    hidden: z.boolean().meta({ description: 'Whether the metric row is hidden from current entry UI' }),
    id: stableIdSchema.meta({ description: 'Stable metric row identifier' }),
    kind: z.enum(['input', 'derived', 'marker']).meta({ description: 'Metric row role in the Work profile' }),
    label: z.string().min(1).meta({ description: 'Current cosmetic metric label' }),
    label_history: z
      .array(workLabelHistorySchema)
      .meta({ description: 'Previous cosmetic labels for this metric row' }),
    meaning_id: stableIdSchema.meta({ description: 'Stable semantic identity of what the metric means' }),
    storage_metric: z.string().min(1).meta({ description: 'Metric name used in daily metric storage' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkMetricRow', description: 'Metric row configured by a Work profile' })

export const workSectionSchema = z
  .object({
    archived_at: z.iso.datetime().optional().meta({ description: 'When this section was archived' }),
    hidden: z.boolean().meta({ description: 'Whether the section is hidden from current entry UI' }),
    id: stableIdSchema.meta({ description: 'Stable section identifier' }),
    label: z.string().min(1).meta({ description: 'Current cosmetic section label' }),
    label_history: z
      .array(workLabelHistorySchema)
      .meta({ description: 'Previous cosmetic labels for this section' }),
    metric_ids: z
      .array(stableIdSchema)
      .meta({ description: 'Ordered metric row identifiers in this section' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkSection', description: 'Ordered section in a Work profile' })

export const workGoalRevisionSchema = z
  .object({
    effective_from: z.iso.date().meta({ description: 'First date this target applies' }),
    effective_until: z.iso
      .date()
      .optional()
      .meta({ description: 'Exclusive date when this target stops applying' }),
    id: stableIdSchema.meta({ description: 'Stable goal revision identifier' }),
    target: z.number().positive().meta({ description: 'Positive target value for the goal revision' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkGoalRevision', description: 'Versioned Work goal target' })

export const workGoalSchema = z
  .object({
    id: stableIdSchema.meta({ description: 'Stable goal identifier' }),
    label: z.string().min(1).optional().meta({ description: 'Current cosmetic goal label' }),
    metric_id: stableIdSchema.meta({ description: 'Metric row this goal targets' }),
    revisions: z.array(workGoalRevisionSchema).min(1).meta({ description: 'Ordered goal target revisions' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkGoal', description: 'Goal attached to a Work profile metric' })

export const workProfileSchema = z
  .object({
    archived_at: z.iso.datetime().optional().meta({ description: 'When this profile was archived' }),
    category_columns: z.array(workCategoryColumnSchema).meta({ description: 'Ordered category columns' }),
    goals: z.array(workGoalSchema).meta({ description: 'Profile goals' }),
    id: stableIdSchema.meta({ description: 'Stable Work profile identifier' }),
    metric_rows: z
      .array(workMetricRowSchema)
      .meta({ description: 'Metric rows available to sections and goals' }),
    name: z.string().min(1).meta({ description: 'Current cosmetic profile display name' }),
    name_history: z.array(workNameHistorySchema).meta({ description: 'Previous cosmetic profile names' }),
    sections: z.array(workSectionSchema).meta({ description: 'Ordered Work profile sections' }),
    status: z.enum(['active', 'archived']).meta({ description: 'Profile lifecycle status' }),
    storage_contract: workStorageContractSchema.meta({ description: 'Storage identities for this profile' }),
  })
  .catchall(z.unknown())
  .meta({ id: 'WorkProfile', description: 'User-owned Work configuration profile' })

const addIssue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) => {
  ctx.addIssue({ code: 'custom', message, path })
}

const validateUniqueIds = (
  ctx: z.RefinementCtx,
  items: { id: string }[],
  path: (string | number)[],
  label: string,
) => {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.id)) addIssue(ctx, [...path, index, 'id'], `Duplicate ${label} id: ${item.id}`)
    seen.add(item.id)
  })
}

const validateGoalRevisions = (
  ctx: z.RefinementCtx,
  revisions: WorkGoalRevision[],
  path: (string | number)[],
) => {
  validateUniqueIds(ctx, revisions, path, 'goal revision')
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index]
    if (revision.effective_until && revision.effective_until <= revision.effective_from) {
      addIssue(
        ctx,
        [...path, index, 'effective_until'],
        'Goal revision effective_until must be after effective_from',
      )
    }
    const next = revisions[index + 1]
    if (!next) continue
    if (next.effective_from <= revision.effective_from) {
      addIssue(
        ctx,
        [...path, index + 1, 'effective_from'],
        'Goal revisions must be ordered by effective_from',
      )
    }
    if (!revision.effective_until || revision.effective_until > next.effective_from) {
      addIssue(ctx, [...path, index, 'effective_until'], 'Goal revisions must not overlap')
    }
  }
}

const validateProfileReferences = (ctx: z.RefinementCtx, profile: WorkProfile, path: (string | number)[]) => {
  validateUniqueIds(ctx, profile.category_columns, [...path, 'category_columns'], 'category column')
  validateUniqueIds(ctx, profile.sections, [...path, 'sections'], 'section')
  validateUniqueIds(ctx, profile.metric_rows, [...path, 'metric_rows'], 'metric row')
  validateUniqueIds(ctx, profile.goals, [...path, 'goals'], 'goal')

  const metricIds = new Set(profile.metric_rows.map((metric) => metric.id))
  profile.sections.forEach((section, sectionIndex) => {
    const sectionMetricIds = new Set<string>()
    section.metric_ids.forEach((metricId, metricIndex) => {
      if (sectionMetricIds.has(metricId)) {
        addIssue(
          ctx,
          [...path, 'sections', sectionIndex, 'metric_ids', metricIndex],
          `Duplicate section metric id: ${metricId}`,
        )
      }
      sectionMetricIds.add(metricId)
      if (!metricIds.has(metricId)) {
        addIssue(
          ctx,
          [...path, 'sections', sectionIndex, 'metric_ids', metricIndex],
          `Unknown section metric id: ${metricId}`,
        )
      }
    })
  })

  profile.goals.forEach((goal, goalIndex) => {
    if (!metricIds.has(goal.metric_id)) {
      addIssue(ctx, [...path, 'goals', goalIndex, 'metric_id'], `Unknown goal metric id: ${goal.metric_id}`)
    }
    validateGoalRevisions(ctx, goal.revisions, [...path, 'goals', goalIndex, 'revisions'])
  })
}

export const workSettingsSchema = z
  .object({
    active_profile_id: stableIdSchema.optional().meta({ description: 'Active Work profile identifier' }),
    position_labels: workPositionLabelSchema.optional().meta({
      description: 'Legacy Recruiting position label overrides retained for compatibility',
    }),
    profiles: z.array(workProfileSchema).optional().meta({ description: 'User-owned Work profiles' }),
    version: z.literal(1).optional().meta({ description: 'Work settings schema version' }),
    weekly_hire_goal: z.number().int().positive().optional().meta({
      description: 'Legacy weekly hire goal override retained for compatibility',
    }),
  })
  .catchall(z.unknown())
  .superRefine((settings, ctx) => {
    const hasGenericEnvelope =
      settings.version !== undefined ||
      settings.active_profile_id !== undefined ||
      settings.profiles !== undefined
    if (!hasGenericEnvelope) return

    if (settings.version !== 1) addIssue(ctx, ['version'], 'Generic Work settings require version 1')
    if (!settings.active_profile_id) {
      addIssue(ctx, ['active_profile_id'], 'Generic Work settings require active_profile_id')
    }
    if (!settings.profiles) {
      addIssue(ctx, ['profiles'], 'Generic Work settings require profiles')
      return
    }
    if (settings.profiles.length === 0) {
      addIssue(ctx, ['profiles'], 'Generic Work settings require at least one profile')
    }

    validateUniqueIds(ctx, settings.profiles, ['profiles'], 'profile')
    if (
      settings.active_profile_id &&
      !settings.profiles.some((profile) => profile.id === settings.active_profile_id)
    ) {
      addIssue(ctx, ['active_profile_id'], `Unknown active profile id: ${settings.active_profile_id}`)
    }
    settings.profiles.forEach((profile, index) =>
      validateProfileReferences(ctx, profile, ['profiles', index]),
    )
  })
  .meta({
    description:
      'Versioned user-owned Work settings with legacy Recruiting overrides retained for compatibility',
    id: 'WorkSettings',
  })

export type WorkCategoryColumn = z.infer<typeof workCategoryColumnSchema>
export type WorkGoal = z.infer<typeof workGoalSchema>
export type WorkGoalRevision = z.infer<typeof workGoalRevisionSchema>
export type WorkLabelHistory = z.infer<typeof workLabelHistorySchema>
export type WorkMetricRow = z.infer<typeof workMetricRowSchema>
export type WorkNameHistory = z.infer<typeof workNameHistorySchema>
export type WorkProfile = z.infer<typeof workProfileSchema>
export type WorkSection = z.infer<typeof workSectionSchema>
export type WorkSettings = z.infer<typeof workSettingsSchema>
export type WorkStorageContract = z.infer<typeof workStorageContractSchema>
