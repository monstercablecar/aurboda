import type {
  Person,
  PeopleStatusKind,
  PeopleStatusDefinition,
  PeopleCareMetricDefinition,
  PeopleStatusContext,
  PeopleGuidance,
  PeopleEvent,
  PeopleEventBody,
  PeopleMetric,
  PeopleCareMilestoneDefinition,
  PeopleCareMilestone,
} from '@aurboda/api-spec'

import { isDeepStrictEqual } from 'node:util'

import { httpError } from '../http-error.ts'

const kinds: PeopleStatusKind[] = [
  'sick',
  'depressed',
  'anxious',
  'surgery_outpatient',
  'surgery_hospitalization',
  'pregnant',
  'mourning',
  'postpartum',
]
const options = (values: string[]) => values.map((value) => ({ value, label: value.replaceAll('_', ' ') }))
const phases: Record<PeopleStatusKind, string[]> = {
  sick: ['acute', 'ongoing', 'recovery'],
  depressed: ['support', 'treatment_support', 'recovery'],
  anxious: ['support', 'anticipating_change', 'coping_support'],
  surgery_outpatient: ['preparation', 'immediate_recovery', 'at_home', 'rehabilitation'],
  surgery_hospitalization: ['preparation', 'immediate_recovery', 'at_home', 'rehabilitation'],
  pregnant: [
    'preconception',
    'confirmation',
    'first_trimester',
    'second_trimester',
    'third_trimester',
    'birth_preparation',
  ],
  mourning: ['recent_loss', 'ongoing_support', 'significant_date'],
  postpartum: ['immediate', 'early', 'ongoing', 'loss_support'],
}
const metricKinds: Record<string, PeopleStatusKind[]> = {
  check_in: kinds,
  practical_help: kinds,
  support_need: kinds,
  symptom_note: ['sick', 'surgery_outpatient', 'surgery_hospitalization', 'pregnant', 'postpartum'],
  energy: ['sick', 'depressed', 'pregnant', 'postpartum'],
  mood: ['depressed', 'pregnant', 'postpartum'],
  stress: ['anxious', 'pregnant', 'mourning', 'surgery_outpatient', 'surgery_hospitalization'],
  discomfort: ['sick', 'surgery_outpatient', 'surgery_hospitalization', 'pregnant', 'postpartum'],
  mobility: ['surgery_outpatient', 'surgery_hospitalization', 'sick'],
  preparation: ['pregnant', 'surgery_outpatient', 'surgery_hospitalization', 'postpartum'],
}
export const peopleStatusDefinitions: PeopleStatusDefinition[] = kinds.map((kind) => ({
  kind,
  label: {
    sick: 'Illness or recovery',
    depressed: 'Depressive symptoms or depression',
    anxious: 'Anxiety or elevated stress',
    surgery_outpatient: 'Outpatient surgery',
    surgery_hospitalization: 'Hospital surgery or recovery',
    pregnant: 'Pregnancy',
    mourning: 'Grief or mourning',
    postpartum: 'Postpartum',
  }[kind],
  description:
    'Optional context supplied by you; not a diagnosis. Phases describe support needs, not a required progression.',
  phases: options(phases[kind]),
  supports_intensity: !['pregnant', 'mourning', 'postpartum'].includes(kind),
  metric_ids: Object.keys(metricKinds).filter((id) => metricKinds[id].includes(kind)),
  transition_kinds: kind === 'pregnant' ? ['postpartum', 'mourning'] : [],
}))
const ratingDescriptions: Record<string, string> = {
  energy: '0 means no energy; 10 means high energy.',
  mood: '0 means very low mood; 10 means very good mood.',
  stress: '0 means no stress; 10 means highest stress.',
  discomfort: '0 means none; 10 means worst discomfort as described by the person.',
}
export const peopleCareMetricDefinitions: PeopleCareMetricDefinition[] = Object.entries(metricKinds).map(
  ([id, status_kinds]) => ({
    id,
    label: options([id])[0].label,
    description: `Optional private recording. ${ratingDescriptions[id] ?? (id === 'support_need' ? 'Record what they explicitly shared about wanting support; do not infer a request.' : 'Record a practical action or information willingly shared.')} No diagnosis, score of wellbeing, or prediction is inferred.`,
    status_kinds,
    value_kind: ratingDescriptions[id]
      ? 'rating'
      : ['check_in', 'practical_help'].includes(id)
        ? 'count'
        : id === 'support_need'
          ? 'state'
          : 'note',
    ...(ratingDescriptions[id] ? { unit: 'rating', min: 0, max: 10 } : {}),
    ...(id === 'support_need' ? { states: options(['requested', 'not_requested', 'unsure']) } : {}),
    sensitive: !['check_in', 'practical_help'].includes(id),
    allowed_sources: ['check_in', 'practical_help'].includes(id)
      ? ['observed', 'self_shared', 'clinical_shared']
      : ['self_shared', 'clinical_shared'],
  }),
)
export const statusToday = (now = new Date(), timezone = 'UTC') =>
  Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone).toPlainDate()
const daysBetween = (start: string, end: string) =>
  Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end), { largestUnit: 'days' }).days
export const statusContexts = (p: Person, now = new Date(), timezone = 'UTC'): PeopleStatusContext[] => {
  const today = statusToday(now, timezone).toString()
  // eslint-disable-next-line complexity -- Independent optional dating inputs and lifecycle context must remain explicit.
  return (p.status_episodes ?? []).map((e) => {
    const contextDate = e.lifecycle !== 'active' && e.resolved_date ? e.resolved_date : today
    const elapsed = daysBetween(e.start_date, contextDate)
    let gestational: number | null = null
    let timing = 'No gestational estimate supplied.'
    if (e.kind === 'pregnant') {
      if (e.estimated_due_date) {
        gestational = 280 - daysBetween(contextDate, e.estimated_due_date)
        timing =
          'Estimated from the supplied due date using a 280-day pregnancy anchor; not a clinical assessment.'
      } else if (e.gestational_age_days !== undefined && e.gestational_as_of) {
        gestational = e.gestational_age_days + daysBetween(e.gestational_as_of, contextDate)
        timing = 'Estimated from the supplied gestational age and reference date.'
      }
      if (gestational !== null && (gestational < 0 || gestational > 315)) {
        gestational = null
        timing =
          'The supplied estimate is outside the supported timing range; review it with the person or care team. Status has not changed.'
      }
    }
    const derived =
      gestational === null
        ? undefined
        : gestational < 98
          ? 'first_trimester'
          : gestational < 196
            ? 'second_trimester'
            : gestational < 259
              ? 'third_trimester'
              : 'birth_preparation'
    if (e.lifecycle !== 'active') {
      timing = `${e.resolved_date ? 'Historical estimate at the recorded resolution date.' : 'Inactive episode; timing is a reference estimate, not an ongoing pregnancy.'} ${timing}`
    }
    return {
      episode_id: e.id,
      kind: e.kind,
      label: peopleStatusDefinitions.find((d) => d.kind === e.kind)!.label,
      lifecycle: e.lifecycle,
      elapsed_days: elapsed,
      phase:
        derived ??
        e.phase ??
        (e.kind === 'postpartum'
          ? elapsed < 7
            ? 'immediate'
            : elapsed < 42
              ? 'early'
              : 'ongoing'
          : undefined),
      gestational_days: gestational,
      gestational_weeks: gestational === null ? null : Math.floor(gestational / 7),
      timing_basis:
        derived && e.phase && e.phase !== derived
          ? `${timing} The dated estimate takes precedence over the saved phase.`
          : timing,
      tracking_available: e.lifecycle === 'active' && elapsed >= 0 && e.tracking_agreed === true,
    }
  })
}
// eslint-disable-next-line complexity -- Explicit cross-field compatibility checks preserve old episodes and enforce optional care semantics.
export const validateStatusEpisodes = (
  p: Person | Omit<Person, 'id' | 'created_at' | 'updated_at'>,
  previous: Person | undefined,
  _events: PeopleEvent[],
  now = new Date(),
  timezone = 'UTC',
) => {
  const episodes = p.status_episodes ?? [],
    today = statusToday(now, timezone).toString()
  if (new Set(episodes.map((e) => e.id.toLowerCase())).size !== episodes.length) {
    throw httpError(400, 'Status episode identifiers must be unique.')
  }
  for (const old of previous?.status_episodes ?? []) {
    if (!episodes.some((e) => e.id === old.id)) {
      throw httpError(
        400,
        'Archive an existing episode instead of removing it. Reload the profile if another edit added an episode.',
      )
    }
  }
  for (const e of episodes) {
    const old = previous?.status_episodes?.find((v) => v.id === e.id)
    if (old && old.kind !== e.kind) {
      throw httpError(400, 'An existing episode cannot change kind; archive it and add another.')
    }
    if (
      e.start_date > today ||
      (e.estimated_end_date && e.estimated_end_date < e.start_date) ||
      (e.resolved_date && (e.resolved_date < e.start_date || e.resolved_date > today))
    ) {
      throw httpError(400, 'Choose ordered status dates; starts and resolutions cannot be in the future.')
    }
    if (e.lifecycle === 'active' && (e.resolved_date || e.outcome)) {
      throw httpError(400, 'Active episodes cannot have a resolution date or pregnancy outcome.')
    }
    if (e.phase && !phases[e.kind].includes(e.phase)) throw httpError(400, 'Unknown phase for this status.')
    const anchor =
      e.estimated_due_date !== undefined ||
      e.gestational_age_days !== undefined ||
      e.gestational_as_of !== undefined
    if ((anchor || e.outcome) && e.kind !== 'pregnant') {
      throw httpError(400, 'Pregnancy timing and outcomes require a pregnancy episode.')
    }
    if (e.estimated_due_date && (e.gestational_age_days !== undefined || e.gestational_as_of)) {
      throw httpError(400, 'Choose one pregnancy timing anchor.')
    }
    if (
      (e.gestational_age_days !== undefined) !== Boolean(e.gestational_as_of) ||
      (e.gestational_as_of && e.gestational_as_of > today)
    ) {
      throw httpError(400, 'Gestational age needs a reference date up to today.')
    }
    if (
      e.previous_episode_id &&
      (e.previous_episode_id === e.id || !episodes.some((v) => v.id === e.previous_episode_id))
    ) {
      throw httpError(400, 'Previous episode must refer to another episode on this profile.')
    }
    if (
      e.transition_history !== undefined &&
      !isDeepStrictEqual(e.transition_history, old?.transition_history ?? [])
    ) {
      throw httpError(400, 'Status transition history is maintained by the server.')
    }
    e.transition_history = old?.transition_history ?? []
    if (old && old.lifecycle !== e.lifecycle) {
      e.transition_history = [
        ...e.transition_history,
        {
          from: old.lifecycle,
          to: e.lifecycle,
          date: today,
          ...(old.outcome ? { previous_outcome: old.outcome } : {}),
          ...(old.resolved_date ? { previous_resolved_date: old.resolved_date } : {}),
        },
      ]
    }
  }
}
export const matchingStatusContexts = (p: Person, g: PeopleGuidance, now = new Date(), timezone = 'UTC') => {
  const condition = g.status_conditions,
    required = [...(condition?.all ?? []), ...(condition?.any ?? [])]
  return statusContexts(p, now, timezone).filter(
    (c) =>
      c.lifecycle === 'active' &&
      c.elapsed_days >= 0 &&
      (condition?.episode
        ? c.kind === condition.episode.kind
          ? windowMatches(c, condition.episode)
          : required.includes(c.kind)
        : !required.length || required.includes(c.kind)),
  )
}
// eslint-disable-next-line complexity -- Explicit cross-field compatibility checks preserve old episodes and enforce optional care semantics.
export const statusRuleReasons = (
  p: Person,
  g: PeopleGuidance,
  events: PeopleEvent[] = [],
  now = new Date(),
  timezone = 'UTC',
): string[] => {
  const contexts = statusContexts(p, now, timezone).filter(
      (c) => c.lifecycle === 'active' && c.elapsed_days >= 0,
    ),
    condition = g.status_conditions,
    reasons: string[] = []
  const has = (kind: PeopleStatusKind) => contexts.some((c) => c.kind === kind)
  if (condition?.all?.some((k) => !has(k))) reasons.push('Not all required active statuses are present.')
  if (condition?.any?.length && !condition.any.some(has)) {
    reasons.push('No requested active status is present.')
  }
  if (condition?.exclude?.some(has)) reasons.push('An excluded active status is present.')
  const window = condition?.episode
  const requiredKinds = [...(condition?.all ?? []), ...(condition?.any ?? [])]
  const candidates = contexts.filter((c) =>
    window ? c.kind === window.kind : !requiredKinds.length || requiredKinds.includes(c.kind),
  )
  if (window && !candidates.some((c) => windowMatches(c, window))) {
    reasons.push('No single active episode satisfies the phase and timing conditions.')
  }
  if (g.log_condition) {
    const candidateIds = new Set(
      candidates.filter((c) => !window || windowMatches(c, window)).map((c) => c.episode_id),
    )
    const logs = events
      .filter(
        (e) =>
          e.type === 'observation' &&
          e.person_id === p.id &&
          Temporal.Instant.from(e.timestamp).toZonedDateTimeISO(timezone).toPlainDate().toString() >=
            (p.status_episodes?.find((episode) => episode.id === e.payload.status_episode_id)?.start_date ??
              '9999-12-31') &&
          e.payload.care_metric === 'support_need' &&
          ['self_shared', 'clinical_shared'].includes(e.payload.information_source ?? '') &&
          candidateIds.has(e.payload.status_episode_id ?? '') &&
          Date.parse(e.timestamp) <= now.getTime() &&
          Date.parse(e.timestamp) >= now.getTime() - g.log_condition!.within_days * 86400000,
      )
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    const newestByEpisode = new Map<string, PeopleEvent>()
    for (const e of logs) {
      if (!newestByEpisode.has(e.payload.status_episode_id!)) {
        newestByEpisode.set(e.payload.status_episode_id!, e)
      }
    }
    if (
      [...newestByEpisode.values()].filter((e) => e.payload.care_state === g.log_condition!.state).length <
      (g.log_condition.min_count ?? 1)
    ) {
      reasons.push('No current explicit support preference matches this condition.')
    }
  }
  return reasons
}
const windowMatches = (
  c: PeopleStatusContext,
  w: {
    phases?: string[]
    min_duration_days?: number
    max_duration_days?: number
    min_gestational_days?: number
    max_gestational_days?: number
  },
) =>
  (!w.phases?.length || w.phases.includes(c.phase ?? '')) &&
  (w.min_duration_days === undefined || c.elapsed_days >= w.min_duration_days) &&
  (w.max_duration_days === undefined || c.elapsed_days < w.max_duration_days) &&
  (w.min_gestational_days === undefined ||
    (c.gestational_days !== null && c.gestational_days >= w.min_gestational_days)) &&
  (w.max_gestational_days === undefined ||
    (c.gestational_days !== null && c.gestational_days < w.max_gestational_days))
// eslint-disable-next-line complexity -- Explicit cross-field compatibility checks preserve old episodes and enforce optional care semantics.
export const validateCareEvent = (
  event: PeopleEventBody,
  p: Person,
  milestones: PeopleCareMilestoneDefinition[],
  previous?: PeopleEventBody,
  timezone = 'UTC',
) => {
  const v = event.payload
  if (!v.status_episode_id) {
    if (v.care_metric || v.milestone_id || v.information_source || v.care_state) {
      throw httpError(400, 'Care fields require a status episode.')
    }
    return
  }
  const episode = p.status_episodes?.find((e) => e.id === v.status_episode_id)
  if (!episode) throw httpError(400, 'Status episode does not belong to this person.')
  if (
    !['observation', 'appointment', 'goal'].includes(event.type) ||
    (event.type !== 'observation' && (v.care_metric || v.milestone_id || v.care_state))
  ) {
    throw httpError(400, 'Care measurements and milestones use observation entries.')
  }
  if (v.care_metric && v.milestone_id) {
    throw httpError(400, 'Record one care metric or one milestone per entry.')
  }
  const definition = peopleCareMetricDefinitions.find((d) => d.id === v.care_metric)
  if (v.care_metric && (!definition || !definition.status_kinds.includes(episode.kind))) {
    throw httpError(400, 'Unknown metric for this status.')
  }
  if (v.milestone_id && !milestones.some((m) => m.id === v.milestone_id && m.status_kind === episode.kind)) {
    throw httpError(400, 'Unknown milestone for this status.')
  }
  const correcting =
    previous?.payload.status_episode_id === v.status_episode_id &&
    previous?.payload.care_metric === v.care_metric &&
    previous?.payload.milestone_id === v.milestone_id
  if (
    !correcting &&
    Temporal.Instant.from(event.timestamp).toZonedDateTimeISO(timezone).toPlainDate().toString() <
      episode.start_date
  ) {
    throw httpError(400, 'New care entries cannot predate the episode start.')
  }
  if (!correcting && episode.lifecycle !== 'active') {
    throw httpError(400, 'New care tracking requires an active episode. Existing history remains editable.')
  }
  if (definition) {
    if (!v.information_source || !definition.allowed_sources.includes(v.information_source)) {
      throw httpError(400, 'Choose an allowed source for this optional observation.')
    }
    if (definition.sensitive && !episode.tracking_agreed && !correcting) {
      throw httpError(400, 'Agree on sensitive tracking before recording it.')
    }
    if (definition.value_kind === 'rating') {
      if (v.value === undefined || v.value < 0 || v.value > 10 || v.unit !== 'rating') {
        throw httpError(400, 'This voluntarily shared rating uses a value from 0 to 10 and unit rating.')
      }
    } else if (v.value !== undefined || v.unit) {
      throw httpError(400, 'This care entry does not use a numeric value.')
    }
    if (definition.value_kind === 'state' && !v.care_state) {
      throw httpError(400, 'Choose the explicitly shared support preference.')
    }
    if (definition.value_kind !== 'state' && v.care_state) {
      throw httpError(400, 'Support preference applies only to support need entries.')
    }
    if (definition.value_kind === 'note' && !v.note?.trim()) {
      throw httpError(400, 'Add the voluntarily shared note.')
    }
  }
  if (
    v.milestone_id &&
    (!v.information_source || !['self_shared', 'clinical_shared'].includes(v.information_source))
  ) {
    throw httpError(
      400,
      'Record milestones only from information willingly shared or shared by the care team.',
    )
  }
  if (v.milestone_id && !episode.tracking_agreed && !correcting) {
    throw httpError(400, 'Agree on milestone tracking before recording it.')
  }
  if (v.milestone_id && !v.observation) throw httpError(400, 'Choose what was recorded about this milestone.')
  if (v.care_state && !definition) throw httpError(400, 'Support preference requires a care metric.')
}
export const careMetrics = (p: Person, events: PeopleEvent[], now = new Date()): PeopleMetric[] =>
  (p.status_episodes ?? []).flatMap((episode) =>
    peopleCareMetricDefinitions
      .filter((d) => d.status_kinds.includes(episode.kind))
      // eslint-disable-next-line complexity -- Metric kind, lifecycle retention and missing observations are independent optional branches.
      .flatMap((d) => {
        const mode = d.value_kind === 'count' ? '7d' : 'latest',
          id = `care:${episode.id}:${d.id}:${mode}`,
          enabled = p.enabled_metrics.includes(id)
        if (episode.lifecycle !== 'active' && !(episode.retain_metrics && enabled)) return []
        const entries = events
          .filter(
            (e) =>
              e.type === 'observation' &&
              e.payload.status_episode_id === episode.id &&
              e.payload.care_metric === d.id &&
              Date.parse(e.timestamp) <= now.getTime() &&
              (mode !== '7d' || Date.parse(e.timestamp) >= now.getTime() - 604800000),
          )
          .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        return [
          {
            id,
            label: `${d.label} (${peopleStatusDefinitions.find((s) => s.kind === episode.kind)!.label})`,
            description: d.description,
            unit: d.unit ?? 'entries',
            event_type: 'observation' as const,
            enabled,
            value: entries.length
              ? mode === '7d'
                ? entries.length
                : d.value_kind === 'rating'
                  ? (entries[0].payload.value ?? null)
                  : null
              : null,
            ...(entries[0] && ['state', 'note'].includes(d.value_kind)
              ? {
                  display_value:
                    d.value_kind === 'state'
                      ? entries[0].payload.care_state?.replaceAll('_', ' ')
                      : entries[0].payload.note,
                }
              : {}),
            window: mode === '7d' ? ('last_7_days' as const) : ('latest' as const),
            window_label: mode === '7d' ? 'Recorded in the last 7 days' : 'Latest recorded entry',
            last_recorded_at: entries[0]?.timestamp ?? null,
            status_episode_id: episode.id,
            care_metric: d.id,
          },
        ]
      }),
  )
export const careMilestones = (
  p: Person,
  definitions: PeopleCareMilestoneDefinition[],
  events: PeopleEvent[],
  now = new Date(),
  timezone = 'UTC',
): PeopleCareMilestone[] =>
  statusContexts(p, now, timezone)
    .filter((c) => c.lifecycle === 'active')
    .flatMap((c) =>
      definitions
        .filter((d) => d.status_kind === c.kind)
        .map((d) => {
          const recorded = events
            .filter(
              (e) =>
                e.payload.status_episode_id === c.episode_id &&
                e.payload.milestone_id === d.id &&
                e.type === 'observation' &&
                Date.parse(e.timestamp) <= now.getTime(),
            )
            .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0]
          const available = windowMatches(c, d),
            past =
              (d.max_duration_days !== undefined && c.elapsed_days >= d.max_duration_days) ||
              (d.max_gestational_days !== undefined &&
                c.gestational_days !== null &&
                c.gestational_days >= d.max_gestational_days)
          return {
            definition_id: d.id,
            status_episode_id: c.episode_id,
            title: d.title,
            description: d.description,
            window_label:
              (d.min_gestational_days !== undefined || d.max_gestational_days !== undefined) &&
              c.gestational_days === null
                ? 'Timing unavailable: supply a gestational estimate to locate this educational discussion window.'
                : 'Educational discussion window; individual care plans may differ.',
            state: recorded
              ? ('recorded' as const)
              : (d.min_gestational_days !== undefined || d.max_gestational_days !== undefined) &&
                  c.gestational_days === null
                ? ('timing_unknown' as const)
                : available
                  ? ('available' as const)
                  : past
                    ? ('past_window' as const)
                    : ('upcoming' as const),
            evidence_ids: d.evidence_ids,
            ...(recorded ? { recorded_event_id: recorded.id } : {}),
          }
        }),
    )
