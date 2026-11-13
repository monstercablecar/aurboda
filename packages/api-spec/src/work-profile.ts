import type {
  WorkCategoryColumn,
  WorkGoal,
  WorkGoalRevision,
  WorkMetricRow,
  WorkPositionLabels,
  WorkProfile,
  WorkSection,
  WorkSettings,
} from './schemas/work.ts'

export const WORK_METRIC_SOURCE = 'career_tracker'
export const dayMarkerMetric = 'work_day_logged'
export const weeklyHiresGoalId = 'weekly_hires'
export const hiresMetricId = 'hires'

export const positions = ['server', 'housekeeper', 'dishwasher', 'deckhand'] as const
export type WorkPosition = (typeof positions)[number]

export const inputGroups = [
  {
    description: 'Review outcomes and invitations',
    id: 'applications',
    label: 'Applications',
    metrics: [
      { key: 'bmi_declines', label: 'BMI' },
      { key: 'location_declines', label: 'Location' },
      { key: 'application_response_declines', label: 'Application responses' },
      { key: 'job_hop_declines', label: 'Job hopping' },
      { key: 'work_gap_declines', label: 'Work gap' },
      { key: 'overqualified_declines', label: 'Overqualified' },
      { key: 'duplicate_declines', label: 'Duplicate' },
      { key: 'applications_assigned', label: 'Applications assigned' },
      { key: 'invited_to_interview', label: 'Invited to interview' },
    ],
  },
  {
    description: 'Scheduled interview outcomes',
    id: 'interviews',
    label: 'Interviews',
    metrics: [
      { key: 'reschedules', label: 'Rescheduled' },
      { key: 'no_shows', label: 'No shows' },
      { key: 'interview_deny_answers', label: 'Denied for answers' },
      { key: 'interview_deny_tattoo', label: 'Denied for tattoo' },
      { key: 'interview_deny_policy', label: 'Denied for policy' },
      { key: 'sent_for_approval', label: 'Sent for approval' },
      { key: 'approved', label: 'Approved' },
    ],
  },
  {
    description: 'Approval denials and offers',
    id: 'offers',
    label: 'Approvals and offers',
    metrics: [
      { key: 'approval_deny_grooming', label: 'Not approved: grooming' },
      { key: 'approval_deny_social_media', label: 'Not approved: social media / Google' },
      { key: 'approval_deny_answers', label: 'Not approved: answers' },
      { key: 'approval_deny_policy', label: 'Not approved: policy' },
      { key: 'approval_deny_language', label: 'Not approved: language barrier' },
      { key: 'offers_accepted', label: 'Offer accepted' },
      { key: 'offers_declined', label: 'Offer declined' },
    ],
  },
] as const

export type WorkInputKey = (typeof inputGroups)[number]['metrics'][number]['key']

export const inputMetricNames = Object.fromEntries(
  inputGroups.flatMap((group) => group.metrics.map((metric) => [metric.key, `work_${metric.key}`])),
) as Record<WorkInputKey, string>

export const derivedMetricNames = {
  application_declines: 'work_application_declines',
  applications_reviewed: 'work_applications_reviewed',
  approval_denials: 'work_approval_denials',
  hires: 'work_hires',
  interview_appointments: 'work_interview_appointments',
  interview_decisions: 'work_interview_decisions',
  interview_denials: 'work_interview_denials',
  offers_decided: 'work_offers_decided',
} as const

export type DerivedMetricKey = keyof typeof derivedMetricNames

const defaultPositionLabels: Record<WorkPosition, string> = {
  deckhand: 'Deckhand',
  dishwasher: 'Dishwasher',
  housekeeper: 'Housekeeper',
  server: 'Server',
}

const inputMetricRows = (): WorkMetricRow[] =>
  inputGroups.flatMap((group) =>
    group.metrics.map((metric) => ({
      hidden: false,
      id: metric.key,
      kind: 'input' as const,
      label: metric.label,
      label_history: [],
      meaning_id: metric.key,
      storage_metric: inputMetricNames[metric.key],
    })),
  )

const derivedMetricRows = (): WorkMetricRow[] =>
  Object.entries(derivedMetricNames).map(([id, storageMetric]) => ({
    hidden: true,
    id,
    kind: 'derived' as const,
    label: id === hiresMetricId ? 'Hires' : id.replaceAll('_', ' '),
    label_history: [],
    meaning_id: id,
    storage_metric: storageMetric,
  }))

export const builtInRecruitingProfile: WorkProfile = {
  category_columns: positions.map((position) => ({
    hidden: false,
    id: position,
    label: defaultPositionLabels[position],
    label_history: [],
  })),
  goals: [
    {
      id: weeklyHiresGoalId,
      label: 'Weekly hires',
      metric_id: hiresMetricId,
      revisions: [{ effective_from: '2026-01-01', id: 'weekly_hires_2026_01_01', target: 10 }],
    },
  ],
  id: 'recruiting',
  metric_rows: [
    ...inputMetricRows(),
    ...derivedMetricRows(),
    {
      hidden: true,
      id: 'day_logged',
      kind: 'marker',
      label: 'Workday logged',
      label_history: [],
      meaning_id: 'day_logged',
      storage_metric: dayMarkerMetric,
    },
  ],
  name: 'Recruiting',
  name_history: [],
  sections: inputGroups.map((group) => ({
    hidden: false,
    id: group.id,
    label: group.label,
    label_history: [],
    metric_ids: group.metrics.map((metric) => metric.key),
  })),
  status: 'active',
  storage_contract: {
    daily_metric_source: WORK_METRIC_SOURCE,
    day_marker_metric: dayMarkerMetric,
  },
}

export interface ResolvedWorkSettings {
  position_labels: Record<WorkPosition, string>
  weekly_hire_goal: number
}

export const defaultWorkSettings = {
  position_labels: defaultPositionLabels,
  weekly_hire_goal: 10,
} satisfies WorkSettings & ResolvedWorkSettings

const cloneProfile = (profile: WorkProfile): WorkProfile => JSON.parse(JSON.stringify(profile)) as WorkProfile

const labelHistory = (item: { label_history?: { label: string; changed_at?: string }[] }) =>
  item.label_history ?? []
const nameHistory = (item: { name_history?: { name: string; changed_at?: string }[] }) =>
  item.name_history ?? []

const labelsFromProfile = (profile: WorkProfile): Record<WorkPosition, string> => {
  const labels = { ...defaultPositionLabels }
  for (const column of profile.category_columns) {
    if (positions.includes(column.id as WorkPosition) && !column.archived_at) {
      labels[column.id as WorkPosition] = column.label
    }
  }
  return labels
}

const materializeRecruitingProfile = (settings: WorkSettings | null | undefined): WorkProfile => {
  const profile = cloneProfile(builtInRecruitingProfile)
  const legacyLabels = settings?.position_labels
  if (legacyLabels) {
    profile.category_columns = profile.category_columns.map((column) => ({
      ...column,
      label: legacyLabels[column.id as keyof WorkPositionLabels] ?? column.label,
    }))
  }
  const legacyGoal = settings?.weekly_hire_goal
  if (legacyGoal !== undefined) {
    profile.goals = profile.goals.map((goal) =>
      goal.id === weeklyHiresGoalId
        ? { ...goal, revisions: goal.revisions.map((revision) => ({ ...revision, target: legacyGoal })) }
        : goal,
    )
  }
  return profile
}

export const resolveActiveWorkProfile = (settings: WorkSettings | null | undefined): WorkProfile => {
  if (settings?.version === 1 && settings.active_profile_id && Array.isArray(settings.profiles)) {
    const activeProfile = settings.profiles.find(
      (profile) => profile.id === settings.active_profile_id && profile.status === 'active',
    )
    if (activeProfile) return cloneProfile(activeProfile)
  }
  return materializeRecruitingProfile(settings)
}

const hasRequiredMetricIdentity = (
  profile: WorkProfile,
  id: string,
  storageMetric: string,
  kind: WorkMetricRow['kind'],
): boolean => {
  const metric = profile.metric_rows.find((row) => row.id === id)
  return metric?.meaning_id === id && metric.storage_metric === storageMetric && metric.kind === kind
}

export const isRecruitingCompatibleProfile = (profile: WorkProfile): boolean => {
  const columnIds = new Set(profile.category_columns.map((column) => column.id))
  const hasColumns = positions.every((position) => columnIds.has(position))
  const hasInputMetrics = (Object.entries(inputMetricNames) as [WorkInputKey, string][]).every(
    ([id, metric]) => hasRequiredMetricIdentity(profile, id, metric, 'input'),
  )
  const hasHiresMetric = hasRequiredMetricIdentity(
    profile,
    hiresMetricId,
    derivedMetricNames.hires,
    'derived',
  )
  const weeklyGoal = profile.goals.find(
    (goal) => goal.id === weeklyHiresGoalId && goal.metric_id === hiresMetricId,
  )

  return (
    profile.storage_contract.daily_metric_source === WORK_METRIC_SOURCE &&
    profile.storage_contract.day_marker_metric === dayMarkerMetric &&
    hasColumns &&
    hasInputMetrics &&
    hasHiresMetric &&
    Boolean(weeklyGoal?.revisions.length)
  )
}

export const goalTargetForDate = (profile: WorkProfile, goalId: string, date: string): number | undefined => {
  const goal = profile.goals.find((candidate) => candidate.id === goalId)
  if (!goal) return undefined
  const revision = [...goal.revisions]
    .reverse()
    .find(
      (candidate) =>
        candidate.effective_from <= date && (!candidate.effective_until || date < candidate.effective_until),
    )
  return revision?.target ?? goal.revisions[0]?.target
}

export const resolveWorkSettings = (
  settings: WorkSettings | null | undefined,
  effectiveDate = '2026-01-01',
): ResolvedWorkSettings => {
  const activeProfile = resolveActiveWorkProfile(settings)
  const profile = isRecruitingCompatibleProfile(activeProfile)
    ? activeProfile
    : materializeRecruitingProfile(settings)
  return {
    position_labels: labelsFromProfile(profile),
    weekly_hire_goal:
      goalTargetForDate(profile, weeklyHiresGoalId, effectiveDate) ?? defaultWorkSettings.weekly_hire_goal,
  }
}

const orderedByIds = <T extends { id: string }>(items: T[], ids: string[], label: string): T[] =>
  ids.map((id) => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Unknown ${label} id: ${id}`)
    return item
  })

const duplicateId = (items: { id: string }[], id: string, label: string) => {
  if (items.some((item) => item.id === id)) throw new Error(`Duplicate ${label} id: ${id}`)
}

const requireExactlyIds = (currentIds: string[], orderedIds: string[], label: string) => {
  const current = [...currentIds].sort()
  const ordered = [...orderedIds].sort()
  if (current.length !== ordered.length || current.some((id, index) => id !== ordered[index])) {
    throw new Error(`Reordered ${label} ids must exactly match existing ids`)
  }
}

export const addWorkProfile = (settings: WorkSettings, profile: WorkProfile): WorkSettings => {
  const profiles = settings.profiles ?? []
  duplicateId(profiles, profile.id, 'profile')
  return {
    ...settings,
    active_profile_id: settings.active_profile_id ?? profile.id,
    profiles: [...profiles, cloneProfile(profile)],
    version: 1,
  }
}

export const addWorkSection = (profile: WorkProfile, section: WorkSection): WorkProfile => {
  duplicateId(profile.sections, section.id, 'section')
  return { ...profile, sections: [...profile.sections, { ...section, metric_ids: [...section.metric_ids] }] }
}

export const addWorkMetricRow = (profile: WorkProfile, metric: WorkMetricRow): WorkProfile => {
  duplicateId(profile.metric_rows, metric.id, 'metric row')
  return { ...profile, metric_rows: [...profile.metric_rows, { ...metric }] }
}

export const addWorkCategoryColumn = (profile: WorkProfile, column: WorkCategoryColumn): WorkProfile => {
  duplicateId(profile.category_columns, column.id, 'category column')
  return { ...profile, category_columns: [...profile.category_columns, { ...column }] }
}

export const renameWorkProfile = (profile: WorkProfile, name: string, changedAt?: string): WorkProfile => ({
  ...profile,
  name,
  name_history: [...nameHistory(profile), { changed_at: changedAt, name: profile.name }],
})

export const renameWorkSection = (
  profile: WorkProfile,
  id: string,
  label: string,
  changedAt?: string,
): WorkProfile => ({
  ...profile,
  sections: profile.sections.map((section) =>
    section.id === id
      ? {
          ...section,
          label,
          label_history: [...labelHistory(section), { changed_at: changedAt, label: section.label }],
        }
      : section,
  ),
})

export const renameWorkMetricRow = (
  profile: WorkProfile,
  id: string,
  label: string,
  changedAt?: string,
): WorkProfile => ({
  ...profile,
  metric_rows: profile.metric_rows.map((metric) =>
    metric.id === id
      ? {
          ...metric,
          label,
          label_history: [...labelHistory(metric), { changed_at: changedAt, label: metric.label }],
        }
      : metric,
  ),
})

export const renameWorkCategoryColumn = (
  profile: WorkProfile,
  id: string,
  label: string,
  changedAt?: string,
): WorkProfile => ({
  ...profile,
  category_columns: profile.category_columns.map((column) =>
    column.id === id
      ? {
          ...column,
          label,
          label_history: [...labelHistory(column), { changed_at: changedAt, label: column.label }],
        }
      : column,
  ),
})

export const reorderWorkProfiles = (settings: WorkSettings, profileIds: string[]): WorkSettings => {
  const profiles = settings.profiles ?? []
  requireExactlyIds(
    profiles.map((profile) => profile.id),
    profileIds,
    'profile',
  )
  return { ...settings, profiles: orderedByIds(profiles, profileIds, 'profile') }
}

export const reorderWorkSections = (profile: WorkProfile, sectionIds: string[]): WorkProfile => {
  requireExactlyIds(
    profile.sections.map((section) => section.id),
    sectionIds,
    'section',
  )
  return { ...profile, sections: orderedByIds(profile.sections, sectionIds, 'section') }
}

export const reorderWorkSectionMetrics = (
  profile: WorkProfile,
  sectionId: string,
  metricIds: string[],
): WorkProfile => ({
  ...profile,
  sections: profile.sections.map((section) => {
    if (section.id !== sectionId) return section
    requireExactlyIds(section.metric_ids, metricIds, 'section metric')
    return { ...section, metric_ids: [...metricIds] }
  }),
})

export const reorderWorkCategoryColumns = (profile: WorkProfile, columnIds: string[]): WorkProfile => {
  requireExactlyIds(
    profile.category_columns.map((column) => column.id),
    columnIds,
    'category column',
  )
  return {
    ...profile,
    category_columns: orderedByIds(profile.category_columns, columnIds, 'category column'),
  }
}

export const setWorkSectionHidden = (profile: WorkProfile, id: string, hidden: boolean): WorkProfile => ({
  ...profile,
  sections: profile.sections.map((section) => (section.id === id ? { ...section, hidden } : section)),
})

export const setWorkMetricRowHidden = (profile: WorkProfile, id: string, hidden: boolean): WorkProfile => ({
  ...profile,
  metric_rows: profile.metric_rows.map((metric) => (metric.id === id ? { ...metric, hidden } : metric)),
})

export const setWorkCategoryColumnHidden = (
  profile: WorkProfile,
  id: string,
  hidden: boolean,
): WorkProfile => ({
  ...profile,
  category_columns: profile.category_columns.map((column) =>
    column.id === id ? { ...column, hidden } : column,
  ),
})

export const archiveWorkProfile = (profile: WorkProfile, archivedAt: string): WorkProfile => ({
  ...profile,
  archived_at: archivedAt,
  status: 'archived',
})

export const archiveWorkSection = (profile: WorkProfile, id: string, archivedAt: string): WorkProfile => ({
  ...profile,
  sections: profile.sections.map((section) =>
    section.id === id ? { ...section, archived_at: archivedAt } : section,
  ),
})

export const archiveWorkMetricRow = (profile: WorkProfile, id: string, archivedAt: string): WorkProfile => ({
  ...profile,
  metric_rows: profile.metric_rows.map((metric) =>
    metric.id === id ? { ...metric, archived_at: archivedAt } : metric,
  ),
})

export const archiveWorkCategoryColumn = (
  profile: WorkProfile,
  id: string,
  archivedAt: string,
): WorkProfile => ({
  ...profile,
  category_columns: profile.category_columns.map((column) =>
    column.id === id ? { ...column, archived_at: archivedAt } : column,
  ),
})

export const replaceWorkMetricSemantics = (
  profile: WorkProfile,
  oldMetricId: string,
  newMetric: WorkMetricRow,
  archivedAt: string,
): WorkProfile => {
  const oldMetric = profile.metric_rows.find((metric) => metric.id === oldMetricId)
  if (!oldMetric) throw new Error(`Unknown metric row id: ${oldMetricId}`)
  if (profile.metric_rows.some((metric) => metric.id === newMetric.id)) {
    throw new Error(`Duplicate metric row id: ${newMetric.id}`)
  }
  if (profile.metric_rows.some((metric) => metric.meaning_id === newMetric.meaning_id)) {
    throw new Error(`Duplicate metric meaning id: ${newMetric.meaning_id}`)
  }
  if (profile.metric_rows.some((metric) => metric.storage_metric === newMetric.storage_metric)) {
    throw new Error(`Duplicate metric storage name: ${newMetric.storage_metric}`)
  }

  return {
    ...profile,
    metric_rows: [
      ...profile.metric_rows.map((metric) =>
        metric.id === oldMetricId ? { ...metric, archived_at: archivedAt } : metric,
      ),
      { ...newMetric },
    ],
    sections: profile.sections.map((section) =>
      section.metric_ids.includes(oldMetricId)
        ? {
            ...section,
            metric_ids: section.metric_ids.flatMap((id) => (id === oldMetricId ? [id, newMetric.id] : [id])),
          }
        : section,
    ),
  }
}

export const appendWorkGoalRevision = (
  profile: WorkProfile,
  goalId: string,
  revision: WorkGoalRevision,
): WorkProfile => {
  if (revision.target <= 0) throw new Error('Goal target must be positive')
  return {
    ...profile,
    goals: profile.goals.map((goal): WorkGoal => {
      if (goal.id !== goalId) return goal
      duplicateId(goal.revisions, revision.id, 'goal revision')
      const previous = goal.revisions.at(-1)
      if (previous && revision.effective_from <= previous.effective_from) {
        throw new Error('New goal revision must be after the latest revision')
      }
      const revisions = goal.revisions.map((existing, index) =>
        index === goal.revisions.length - 1 && !existing.effective_until
          ? { ...existing, effective_until: revision.effective_from }
          : existing,
      )
      return { ...goal, revisions: [...revisions, { ...revision }] }
    }),
  }
}
