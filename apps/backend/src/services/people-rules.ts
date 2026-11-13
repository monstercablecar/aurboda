import type {
  Person,
  PeopleContext,
  PeopleGuidance,
  MatchedPeopleGuidance,
  PeopleEvent,
  PeopleMetric,
  PeopleModule,
} from '@aurboda/api-spec'

import type { PeopleFeedback } from '../db/people.ts'

import { statusRuleReasons, matchingStatusContexts } from './people-status.ts'

const checkpoints = [2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60]
const lifeStage = (months: number, years: number) => {
  return months < 12
    ? 'infant'
    : months < 36
      ? 'toddler'
      : years < 6
        ? 'preschool'
        : years < 12
          ? 'school_age'
          : years < 18
            ? 'adolescent'
            : years < 65
              ? 'adult'
              : 'older_adult'
}
const currentFocus = (p: Person, months: number, years: number) => {
  return p.relationship === 'child'
    ? months < 12
      ? 'Interaction, early communication, and movement.'
      : years < 6
        ? 'Play, communication, and growing independence.'
        : years < 12
          ? 'Learning, friendships, and independence.'
          : years < 18
            ? 'Autonomy, communication, and privacy.'
            : 'Connection and respect for adult independence.'
    : p.relationship === 'parent'
      ? p.needs.includes('regular_caregiving')
        ? 'Connection and care coordination.'
        : 'Connection, independence, and shared activities.'
      : p.relationship === 'friend'
        ? 'Shared interests and meaningful connection.'
        : 'Communication and mutually enjoyable shared experiences.'
}
export const peopleContext = (p: Person, now = new Date()): PeopleContext => {
  const today = Temporal.PlainDate.from(now.toISOString().slice(0, 10))
  const birth = p.date_of_birth
    ? Temporal.PlainDate.from(p.date_of_birth)
    : Temporal.PlainDate.from(p.approximate_age!.as_of).subtract({
        [p.approximate_age!.unit]: p.approximate_age!.value,
      })
  const days = birth.until(today, { largestUnit: 'days' }).days
  const months = birth.until(today, { largestUnit: 'months' }).months
  const years = birth.until(today, { largestUnit: 'years' }).years
  const developmental =
    months < 24
      ? Math.max(
          0,
          birth.add({ weeks: p.corrected_age_weeks }).until(today, { largestUnit: 'months' }).months,
        )
      : months
  const stage = lifeStage(months, years)
  const focus = currentFocus(p, months, years)
  return {
    age_days: days,
    age_months: months,
    age_years: years,
    developmental_age_months: developmental,
    age_display: `${p.approximate_age ? 'About ' : ''}${months < 1 ? `${days} days` : months < 24 ? `${months} months` : `${years} years`}`,
    life_stage: stage,
    focus,
    approximate: !p.date_of_birth,
    previous_checklist_months:
      p.relationship === 'child' && developmental <= 60
        ? (checkpoints.filter((m) => m <= developmental).at(-1) ?? null)
        : null,
    next_checklist_months:
      p.relationship === 'child' && developmental < 60
        ? (checkpoints.find((m) => m > developmental) ?? null)
        : null,
  }
}
const matchesSelections = (required: string[], selected: string[]) =>
  !required.length || required.some((n) => selected.includes(n))
const matchingAge = (p: Person, c: PeopleContext, g: PeopleGuidance) => {
  const corrected =
    g.guidance_type === 'development' &&
    !['safety', 'help'].includes(g.child_section ?? '') &&
    c.age_months < 24
  if (g.age_unit === 'years') return c.age_years
  if (g.age_unit === 'days') {
    return corrected ? Math.max(0, c.age_days - p.corrected_age_weeks * 7) : c.age_days
  }
  return corrected ? c.developmental_age_months : c.age_months
}
const genderMatches = (person: Person, guidance: PeopleGuidance) => {
  if (!guidance.genders?.length) return true
  const identity = person.gender?.identity
  return Boolean(
    identity && ['woman', 'man', 'nonbinary'].includes(identity) && guidance.genders.includes(identity),
  )
}
const unsafeRelationshipExercise = (p: Person, g: PeopleGuidance) =>
  p.relationship === 'spouse' &&
  p.statuses.includes('marriage_safety') &&
  ((g.guidance_type === 'relationship' && g.review?.claim_type !== 'ethical') ||
    g.evidence_class === 'conceptual_heuristic')

const baseGuidanceReasons = (p: Person, c: PeopleContext, g: PeopleGuidance) => {
  const reasons: string[] = []
  if (!g.active) reasons.push('This reference is inactive.')
  if (!g.relationship_types.includes(p.relationship)) reasons.push('Relationship type does not match.')
  if (!genderMatches(p, g)) reasons.push('Explicit gender context does not match; no physiology is inferred.')
  const age = matchingAge(p, c, g)
  if (age < g.min_age || age >= g.max_age) {
    reasons.push(`Age used (${age} ${g.age_unit}) is outside ${g.min_age} to under ${g.max_age}.`)
  }
  for (const [required, selected, label] of [
    [g.needs, p.needs, 'support needs'],
    [g.statuses, p.statuses, 'relationship context'],
    [g.interests, p.interests, 'interests'],
    [g.goals, p.goals, 'goals'],
  ] as const) {
    if (!matchesSelections(required, selected)) reasons.push(`Selected ${label} do not match.`)
  }
  if (g.contraindications.some((n) => p.needs.includes(n) || p.statuses.includes(n))) {
    reasons.push('An explicit exclusion applies.')
  }
  if (unsafeRelationshipExercise(p, g)) {
    reasons.push('Individual safety support takes priority over ordinary relationship exercises.')
  }
  if (['lover', 'spouse'].includes(p.relationship) && c.age_years < 18) {
    reasons.push('Romantic relationship guidance is limited to adult profiles.')
  }
  return reasons
}
const eligible = (p: Person, c: PeopleContext, g: PeopleGuidance) => baseGuidanceReasons(p, c, g).length === 0
export const matchGuidance = (
  p: Person,
  c: PeopleContext,
  catalog: PeopleGuidance[],
  feedback: PeopleFeedback[] = [],
  now = new Date(),
  events: PeopleEvent[] = [],
  timezone = 'UTC',
): MatchedPeopleGuidance[] =>
  catalog
    .flatMap((g) => {
      if (!eligible(p, c, g) || statusRuleReasons(p, g, events, now, timezone).length) return []
      const existingFeedback = feedback.find(
        (f) =>
          f.guidance_id === g.id &&
          f.version === g.version &&
          (!g.status_conditions ||
            matchingStatusContexts(p, g, now, timezone).every(
              (context) =>
                f.recorded_at.toISOString().slice(0, 10) >=
                (p.status_episodes?.find((e) => e.id === context.episode_id)?.start_date ?? ''),
            )) &&
          (!g.recurring || now.getTime() - f.recorded_at.getTime() < g.review_interval * 86400000),
      )
      return [
        {
          ...g,
          reasons: [
            `Relationship: ${p.relationship}.`,
            ...(g.status_conditions ? ['Explicit active status and timing conditions match.'] : []),
            ...(g.log_condition ? ['A current explicitly shared support preference matches.'] : []),
            ...(g.genders?.length
              ? [
                  `Shown for the explicitly selected gender context: ${p.gender?.identity}. No health, ability, or personality traits are inferred.`,
                ]
              : []),
            `Age used: ${matchingAge(p, c, g)} ${g.age_unit}; applies from ${g.min_age} to under ${g.max_age} ${g.age_unit}.`,
            ...(g.guidance_type === 'development' &&
            !['safety', 'help'].includes(g.child_section ?? '') &&
            g.age_unit !== 'years' &&
            c.developmental_age_months !== c.age_months
              ? ['Development uses the configured corrected age; safety uses chronological age.']
              : []),
            ...g.needs
              .filter((n) => p.needs.includes(n))
              .map((n) => `Selected support context: ${n.replaceAll('_', ' ')}.`),
            ...g.statuses
              .filter((n) => p.statuses.includes(n))
              .map((n) => `Selected status: ${n.replaceAll('_', ' ')}.`),
            ...g.goals.filter((n) => p.goals.includes(n)).map((n) => `Selected goal: ${n}.`),
            ...g.interests.filter((n) => p.interests.includes(n)).map((n) => `Selected interest: ${n}.`),
          ],
          ...(existingFeedback ? { feedback: existingFeedback.action } : {}),
        },
      ]
    })
    .sort((a, b) => guidanceRank(a) - guidanceRank(b) || b.priority - a.priority || a.id.localeCompare(b.id))
    .filter(
      (g, index, all) =>
        !g.dedupe_key || all.findIndex((other) => other.dedupe_key === g.dedupe_key) === index,
    )
const guidanceRank = (g: PeopleGuidance) =>
  g.guidance_type === 'safety'
    ? 0
    : g.status_conditions
      ? 1
      : g.guidance_type === 'development'
        ? 2
        : g.needs.length
          ? 3
          : g.goals.length || g.interests.length
            ? 4
            : g.guidance_type === 'relationship'
              ? 5
              : 6
export const unionMinutes = (
  events: PeopleEvent[],
  now = new Date(),
  since = new Date(-8640000000000000),
) => {
  const intervals = events
    .filter((e) => e.end_time && ['shared_activity', 'care', 'sleep'].includes(e.type))
    .map((e) => [
      Math.max(Date.parse(e.timestamp), since.getTime()),
      Math.min(Date.parse(e.end_time!), now.getTime()),
    ])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  let total = 0,
    start = intervals[0]?.[0] ?? 0,
    end = start
  for (const [a, b] of intervals) {
    if (a > end) {
      total += end - start
      start = a
      end = b
    } else end = Math.max(end, b)
  }
  return (total + end - start) / 60000
}
const metricDescription = (
  type: PeopleEvent['type'],
  aggregate: string,
  window: string,
  windowLabel: string,
) =>
  type === 'feeding' && aggregate === 'sum'
    ? `${windowLabel}. Sum of explicitly recorded quantities in this exact unit; no inferred intake or unit conversion.`
    : type === 'growth' && aggregate === 'latest'
      ? 'Latest recorded measurement of this type and exact unit; no percentile, expected range or clinical interpretation.'
      : type === 'diaper' && window !== 'all_time'
        ? 'Explicitly classified entries in the last 24 hours. Mixed diapers count once as wet and once as dirty; unclassified entries are excluded.'
        : type === 'goal'
          ? 'Counts recorded goals; enabling this metric does not create a goal or measure progress.'
          : `${windowLabel}. Optional private entries, not a measure of relationship quality or a clinical assessment. Missing entries do not imply missing activity.`
// eslint-disable-next-line complexity -- Explicit metric eligibility and aggregation choices preserve legacy IDs and semantics.
export const metricDefinitions = (
  p: Person,
  c: PeopleContext,
  input: PeopleEvent[],
  now = new Date(),
): PeopleMetric[] => {
  const events = input.filter(
    (e) =>
      e.source !== 'system' &&
      e.type !== 'relationship_state' &&
      !e.payload.care_metric &&
      !e.payload.milestone_id &&
      Date.parse(e.timestamp) <= now.getTime(),
  )
  const types: PeopleEvent['type'][] = ['contact', 'shared_activity', 'goal']
  if (p.relationship === 'child') types.push('observation', 'growth')
  if (p.relationship === 'child' && (c.age_months < 24 || p.needs.includes('additional_support'))) {
    types.push('sleep', 'feeding', 'diaper')
  }
  if (p.needs.some((n) => ['regular_caregiving', 'health_coordination', 'additional_support'].includes(n))) {
    types.push('care', 'appointment')
  }
  if (['lover', 'spouse', 'friend'].includes(p.relationship)) types.push('reflection')
  const definitions: PeopleMetric[] = []
  const add = (
    id: string,
    type: PeopleEvent['type'],
    label: string,
    entries: PeopleEvent[],
    window: NonNullable<PeopleMetric['window']>,
    unit = 'events',
    aggregate: 'count' | 'duration' | 'sum' | 'latest' = 'count',
  ) => {
    if (type === 'relationship_state') return
    const duration = window === 'last_24_hours' ? 86400000 : window === 'last_7_days' ? 604800000 : null
    const since = duration === null ? new Date(-8640000000000000) : new Date(now.getTime() - duration)
    const contributing = entries.filter((e) =>
      aggregate === 'duration'
        ? e.end_time &&
          Date.parse(e.end_time) > since.getTime() &&
          Math.min(Date.parse(e.end_time), now.getTime()) > Date.parse(e.timestamp)
        : duration === null || Date.parse(e.timestamp) >= since.getTime(),
    )
    const latest = contributing.toSorted((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0]
    const windowLabel = {
      all_time: 'All recorded history',
      last_24_hours: 'Last 24 hours',
      last_7_days: 'Last 7 days',
      latest: 'Latest recorded measurement',
      current_state: 'Current recorded status',
    }[window]
    definitions.push({
      id,
      label,
      unit,
      event_type: type,
      enabled: p.enabled_metrics.includes(id),
      value: !contributing.length
        ? null
        : aggregate === 'duration'
          ? unionMinutes(contributing, now, since)
          : aggregate === 'sum'
            ? contributing.reduce((sum, e) => sum + (e.payload.value ?? 0), 0)
            : aggregate === 'latest'
              ? (latest.payload.value ?? null)
              : contributing.length,
      window,
      window_label: windowLabel,
      last_recorded_at: latest?.timestamp ?? null,
      ...(duration === null ? {} : { window_start: since.toISOString(), window_end: now.toISOString() }),
      description: metricDescription(type, aggregate, window, windowLabel),
    })
  }
  for (const type of types) {
    const entries = events.filter((e) => e.type === type)
    const duration = ['sleep', 'shared_activity', 'care'].includes(type)
    add(
      type,
      type,
      type === 'goal' ? 'Goals' : `${type.replaceAll('_', ' ')} — all recorded`,
      entries,
      'all_time',
      duration ? 'minutes' : 'events',
      duration ? 'duration' : 'count',
    )
    if (['contact', 'shared_activity', 'care'].includes(type)) {
      add(
        `recorded:${type}:7d`,
        type,
        `${type.replaceAll('_', ' ')} — last 7 days`,
        entries,
        'last_7_days',
        duration ? 'minutes' : 'events',
        duration ? 'duration' : 'count',
      )
    }
    if (['sleep', 'feeding'].includes(type)) {
      add(
        `recorded:${type}:24h`,
        type,
        `${type} — last 24 hours`,
        entries,
        'last_24_hours',
        duration ? 'minutes' : 'events',
        duration ? 'duration' : 'count',
      )
    }
    if (type === 'diaper') {
      for (const kind of ['wet', 'dirty'] as const) {
        add(
          `recorded:diaper:${kind}:24h`,
          type,
          `${kind} diapers — last 24 hours`,
          entries.filter((e) => e.payload.diaper_type === kind || e.payload.diaper_type === 'mixed'),
          'last_24_hours',
        )
      }
    }
    if (type === 'goal') {
      for (const status of ['active', 'completed', 'paused']) {
        add(
          `recorded:goal:${status}`,
          type,
          `${status} goals`,
          entries.filter((e) => (e.payload.goal_status ?? 'active') === status),
          'current_state',
        )
      }
    }
  }
  const numeric = new Map<string, PeopleEvent[]>()
  for (const e of events) {
    if (e.payload.value === undefined || !e.payload.unit || !types.includes(e.type)) continue
    const key = e.payload.measurement_type
      ? `recorded:${e.type}:${e.payload.measurement_type}:${encodeURIComponent(e.payload.unit)}`
      : `${e.type}:${e.payload.unit}`
    numeric.set(key, [...(numeric.get(key) ?? []), e])
  }
  for (const [id, entries] of numeric) {
    const e = entries[0]
    const label =
      e.type === 'growth'
        ? `${e.payload.measurement_type?.replaceAll('_', ' ') ?? 'Unspecified growth'} (${e.payload.unit})`
        : `Recorded feeding quantity (${e.payload.unit})`
    add(
      id,
      e.type,
      label,
      entries,
      e.type === 'feeding' ? 'all_time' : 'latest',
      e.payload.unit,
      e.type === 'feeding' ? 'sum' : 'latest',
    )
    if (e.type === 'feeding') {
      add(
        `recorded:feeding:24h:${encodeURIComponent(e.payload.unit!)}`,
        e.type,
        `${label} — last 24 hours`,
        entries,
        'last_24_hours',
        e.payload.unit,
        'sum',
      )
    }
  }
  return definitions
}
export const dashboardModules = (p: Person, c: PeopleContext): PeopleModule[] => {
  const ids =
    p.relationship === 'child'
      ? c.age_years >= 18
        ? ['connection', 'shared_activities']
        : c.age_years < 6
          ? ['development', 'safety', 'shared_activities']
          : ['learning', 'independence', 'safety', 'shared_activities']
      : p.relationship === 'parent'
        ? ['connection', 'shared_activities']
        : p.relationship === 'friend'
          ? ['connection', 'shared_interests', 'shared_activities']
          : ['connection', 'communication', 'shared_planning']
  if (p.relationship === 'spouse') ids.push('shared_routines', 'household_coordination')
  if (p.needs.includes('regular_caregiving')) ids.push('care_coordination')
  return ids
    .filter((id) => !p.hidden_modules.includes(id) || id === 'safety')
    .map((id) => ({
      id,
      title: id[0].toUpperCase() + id.slice(1).replaceAll('_', ' '),
      hideable: id !== 'safety',
      description: moduleDescriptions[id] ?? c.focus,
    }))
}

const moduleDescriptions: Record<string, string> = {
  development:
    'Review age-appropriate milestone context and record optional observations without diagnostic scoring.',
  safety: 'Explore age-appropriate precautions with linked evidence and scope.',
  shared_activities: 'Plan mutually enjoyable activities and optionally record shared time.',
  learning: 'Support curiosity, play, and learning with age-appropriate opportunities.',
  independence: 'Support growing responsibility, autonomy, and privacy.',
  connection: 'Make room for meaningful contact while respecting independence.',
  shared_interests: 'Explore shared interests and choose activities together.',
  communication: 'Support attentive, respectful conversations and mutual understanding.',
  shared_planning: 'Discuss shared goals and choose plans together.',
  shared_routines: 'Choose small shared routines that fit both people.',
  household_coordination: 'Coordinate household responsibilities collaboratively.',
  care_coordination: 'Record explicitly selected support, care activities, and appointments.',
}

export const evaluatePeopleGuidance = (
  p: Person,
  c: PeopleContext,
  catalog: PeopleGuidance[],
  events: PeopleEvent[] = [],
  now = new Date(),
  timezone = 'UTC',
) => {
  const matched = matchGuidance(p, c, catalog, [], now, events, timezone)
  return catalog.map((g) => {
    const match = matched.find((m) => m.id === g.id)
    return {
      guidance_id: g.id,
      applicable: Boolean(match),
      reasons: match?.reasons ?? [
        ...baseGuidanceReasons(p, c, g),
        ...statusRuleReasons(p, g, events, now, timezone),
        ...(eligible(p, c, g) && !statusRuleReasons(p, g, events, now, timezone).length
          ? ['A higher-priority equivalent recommendation is shown.']
          : []),
      ],
    }
  })
}
