import type {
  Person,
  PeopleCalendarQuery,
  CreatePersonBody,
  UpdatePersonBody,
  PeopleEventBody,
  UpdatePeopleEventBody,
  PeopleFeedbackBody,
  PeopleGuidanceQuery,
  PeopleDashboard,
  PeopleOptions,
  PeopleHelpTree,
  PeopleHelpTreeQuery,
} from '@aurboda/api-spec'

import {
  createPersonBodySchema,
  peopleCalendarQuerySchema,
  updatePersonBodySchema,
  peopleEventBodySchema,
  updatePeopleEventBodySchema,
  peopleFeedbackBodySchema,
} from '@aurboda/api-spec'
import { createHash } from 'node:crypto'
import { z } from 'zod'

import * as db from '../db/people.ts'
import { httpError } from '../http-error.ts'
import { buildPeopleCalendar, getDateKind, celebrationIdeas } from './people-calendar.ts'
import { peopleCatalog, peopleSources, peopleMilestones, peopleCareEthics } from './people-catalog.ts'
import { marriageContexts } from './people-catalog/marriage.ts'
import { personImportantDates } from './people-dates.ts'
import { relationshipTransitions } from './people-relationship-history.ts'
import { peopleRemindersAvailable, validatePeopleReminder } from './people-reminders.ts'
import {
  evaluatePeopleGuidance,
  peopleContext,
  matchGuidance,
  metricDefinitions,
  dashboardModules,
  unionMinutes,
} from './people-rules.ts'
import {
  peopleStatusDefinitions,
  peopleCareMetricDefinitions,
  statusContexts,
  validateStatusEpisodes,
  validateCareEvent,
  careMetrics,
  careMilestones,
} from './people-status.ts'
import { getUserTimezone } from './settings.ts'

const labels: Record<string, string> = {
  journal: 'Journal entry',
  memory: 'Memory',
  woman: 'Girl / woman',
  man: 'Boy / man',
  nonbinary: 'Nonbinary',
  self_described: 'Self-describe',
  prefer_not_to_say: 'Prefer not to say',
  typical: 'Typical development / no identified concern',
  independent: 'Independent',
  additional_support: 'Additional support needs',
  physical_accessibility: 'Physical accessibility needs',
  developmental_concern: 'Developmental concern',
  regular_caregiving: 'Regular caregiving',
  relationship_maintenance: 'General relationship maintenance',
  not_observed: 'Not observed yet',
  custom: 'Custom context (describe in notes)',
}
const option = (value: string) => ({
  value,
  label: labels[value] ?? value[0].toUpperCase() + value.slice(1).replaceAll('_', ' '),
})
export const peopleOptions: PeopleOptions = {
  status_definitions: peopleStatusDefinitions,
  care_metric_definitions: peopleCareMetricDefinitions,
  measurement_types: ['weight', 'length', 'head_circumference'].map(option),
  diaper_types: ['wet', 'dirty', 'mixed'].map(option),
  date_kinds: ['birthday', 'anniversary', 'celebration', 'remembrance', 'other'].map(option),
  goal_statuses: ['active', 'completed', 'paused'].map(option),
  genders: ['woman', 'man', 'nonbinary', 'self_described', 'prefer_not_to_say'].map(option),
  topics: [...new Set(peopleCatalog.flatMap((g) => g.domains))].sort().map(option),
  event_fields: {
    contact: ['note'],
    shared_activity: ['note', 'end_time', 'time_kind'],
    care: ['note', 'end_time', 'time_kind'],
    sleep: ['note', 'end_time'],
    feeding: ['note', 'value', 'unit'],
    diaper: ['note', 'diaper_type'],
    growth: ['note', 'value', 'unit', 'measurement_type'],
    observation: [
      'note',
      'observation',
      'guidance_id',
      'status_episode_id',
      'care_metric',
      'milestone_id',
      'information_source',
      'care_state',
      'value',
      'unit',
    ],
    appointment: ['title', 'note', 'end_time', 'status_episode_id'],
    goal: ['title', 'note', 'goal_status', 'target_date', 'status_episode_id'],
    reflection: ['note'],
    journal: ['title', 'location', 'note'],
    memory: ['title', 'location', 'note'],
  },
  relationships: ['child', 'parent', 'lover', 'spouse', 'friend'].map(option),
  needs: {
    child: [
      'typical',
      'developmental_concern',
      'additional_support',
      'physical_accessibility',
      'learning_support',
      'health_coordination',
      'custom',
    ].map(option),
    parent: [
      'independent',
      'occasional_assistance',
      'regular_caregiving',
      'health_coordination',
      'mobility_support',
      'social_connection',
      'custom',
    ].map(option),
    lover: ['relationship_maintenance', 'building_connection', 'shared_planning', 'custom'].map(option),
    spouse: ['relationship_maintenance', 'building_connection', 'shared_planning', 'custom'].map(option),
    friend: ['maintain_friendship', 'build_friendship', 'shared_activities', 'custom'].map(option),
  },
  statuses: [
    ...['established', 'long_distance', 'transition', 'under_strain', 'reconnect'].map(option),
    ...marriageContexts,
  ],
  event_types: [
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
  ].map(option),
  age_units: ['days', 'months', 'years'].map(option),
  observation_states: ['observed', 'not_observed', 'unsure', 'not_reviewed', 'goal', 'concern'].map(option),
  time_kinds: ['engaged', 'caregiving', 'presence'].map(option),
  guidance_types: [
    'safety',
    'development',
    'optimization',
    'relationship',
    'care',
    'prevention',
    'resource',
  ].map(option),
  life_stages: ['infant', 'toddler', 'preschool', 'school_age', 'adolescent', 'adult', 'older_adult'].map(
    option,
  ),
}
export const validatePeopleId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw httpError(400, 'Invalid person or event identifier.')
}
export const requirePerson = async (user: string, id: string) => {
  validatePeopleId(id)
  const p = await db.getPerson(user, id)
  if (!p) throw httpError(404, 'Person not found.')
  return p
}
const validateProfile = (body: CreatePersonBody, now = new Date()) => {
  const result = createPersonBodySchema.safeParse(body)
  if (!result.success) throw httpError(400, result.error.issues.map((i) => i.message).join('; '))
  const p = result.data
  const today = now.toISOString().slice(0, 10)
  if (
    (p.date_of_birth && p.date_of_birth > today) ||
    (p.approximate_age && p.approximate_age.as_of > today)
  ) {
    throw httpError(400, 'Age dates cannot be in the future.')
  }
  const c = peopleContext({ ...p, id: '', created_at: '', updated_at: '' }, now)
  if (c.age_days < 0 || c.age_years > 150) throw httpError(400, 'Age must be between birth and 150 years.')
  if (p.corrected_age_weeks && (p.relationship !== 'child' || p.corrected_age_weeks * 7 > c.age_days)) {
    throw httpError(400, 'Corrected age applies to children under two years and cannot precede birth.')
  }
  return p
}
export const listPeople = db.listPeople
export const getPeopleCalendar = async (user: string, range: PeopleCalendarQuery) => {
  const parsed = peopleCalendarQuerySchema.safeParse(range)
  if (!parsed.success) {
    throw httpError(
      400,
      'Choose valid ordered calendar dates spanning at most 3660 days, including both endpoints.',
    )
  }
  return buildPeopleCalendar(
    await db.listPeople(user),
    parsed.data.from,
    parsed.data.to,
    await getUserTimezone(user),
  )
}
export const createPerson = async (user: string, body: CreatePersonBody) => {
  const parsed = validateProfile(body)
  validateStatusEpisodes(parsed, undefined, [], new Date(), await getUserTimezone(user))
  return db.peopleTransaction(user, async (tx) => {
    const person = await db.createPerson(tx, parsed)
    for (const event of relationshipTransitions([], parsed.statuses, [])) {
      await db.insertEvent(tx, person.id, user, event)
    }
    return person
  })
}
export const updatePerson = async (user: string, id: string, body: UpdatePersonBody) => {
  validatePeopleId(id)
  const parsed = updatePersonBodySchema.safeParse(body)
  if (!parsed.success) throw httpError(400, 'Invalid profile changes.')
  return db.peopleTransaction(user, async (tx) => {
    if (!(await db.lockPerson(tx, id))) throw httpError(404, 'Person not found.')
    const p = await db.getPerson(tx, id)
    if (!p) throw httpError(404, 'Person not found.')
    if (parsed.data.expected_updated_at && parsed.data.expected_updated_at !== p?.updated_at) {
      throw httpError(409, 'This profile changed in another editor. Reload it before saving your changes.')
    }
    const merged = validateProfile({ ...p, ...parsed.data })
    const history = await db.listEvents(tx, id)
    const now = new Date()
    validateStatusEpisodes(merged, p, history, now, await getUserTimezone(user))
    const updated = (await db.updatePerson(tx, id, merged))!
    for (const event of relationshipTransitions(p.statuses, merged.statuses, history, now)) {
      await db.insertEvent(tx, id, user, event)
    }
    return updated
  })
}
export const deletePerson = async (user: string, id: string) => {
  validatePeopleId(id)
  if (!(await db.deletePerson(user, id))) throw httpError(404, 'Person not found.')
  return { id }
}
export const listEvents = async (user: string, id: string) => {
  await requirePerson(user, id)
  return db.listEvents(user, id)
}
export const getGuidance = async (user: string, id: string, filters: PeopleGuidanceQuery = {}) => {
  const p = await requirePerson(user, id)
  const c = peopleContext(p)
  return matchGuidance(
    p,
    c,
    peopleCatalog,
    await db.listFeedback(user, id),
    new Date(),
    await db.listEvents(user, id),
    await getUserTimezone(user),
  ).filter(
    (g) =>
      (!filters.topic || g.domains.includes(filters.topic)) &&
      (!filters.guidance_type || g.guidance_type === filters.guidance_type) &&
      (!filters.source || g.evidence_ids.includes(filters.source)) &&
      (!filters.relationship || g.relationship_types.includes(filters.relationship)) &&
      (!filters.life_stage || filters.life_stage === c.life_stage),
  )
}
export const getDashboard = async (user: string, id: string, now = new Date()): Promise<PeopleDashboard> => {
  const p = await requirePerson(user, id)
  const c = peopleContext(p, now)
  const events = await db.listEvents(user, id)
  const past = events.filter((e) => Date.parse(e.timestamp) <= now.getTime())
  const timezone = await getUserTimezone(user)
  const applicable = matchGuidance(
    p,
    c,
    peopleCatalog,
    await db.listFeedback(user, id),
    now,
    events,
    timezone,
  )
  const metrics = [...metricDefinitions(p, c, past, now), ...careMetrics(p, events, now)]
  const hasChildGuide = p.relationship === 'child' && applicable.some((g) => g.child_section)
  const untagged = applicable.filter(
    (g) => !g.status_conditions && !g.log_condition && (!hasChildGuide || !g.child_section),
  )
  const featured = untagged.filter((g) => !g.genders?.length && (g.guidance_type === 'safety' || !g.feedback))
  const contextual = untagged.filter((g) => g.genders?.length && !g.feedback).slice(0, 2)
  const support = featured.find((g) => g.guidance_type === 'development')
  const current = featured.slice(0, 3)
  if (support && !current.includes(support)) current[Math.min(2, current.length)] = support
  const upcoming = peopleCatalog.filter(
    (g) =>
      g.active &&
      g.relationship_types.includes(p.relationship) &&
      g.checklist_age_months === c.next_checklist_months,
  )
  const ids = new Set([...applicable, ...upcoming].flatMap((g) => g.evidence_ids))
  const milestones = careMilestones(p, peopleMilestones, events, now, timezone)
  for (const source of [...milestones.flatMap((m) => m.evidence_ids), ...peopleCareEthics.evidence_ids]) {
    ids.add(source)
  }
  return {
    status_contexts: statusContexts(p, now, timezone),
    status_guidance: applicable.filter((g) => g.status_conditions || g.log_condition),
    care_milestones: milestones,
    care_ethics: peopleCareEthics,
    child_guide: !hasChildGuide
      ? null
      : {
          title: c.age_months < 12 ? 'Super Baby: play, notice and care' : 'Child development and care',
          introduction:
            'Small everyday interactions support development. These references offer ideas and things to notice, not a test or diagnosis.',
          groups: (
            [
              ['safety', 'Safer everyday care', 'Practical safety guidance for this age.'],
              ['help', 'When to ask for help', 'Support and professional advice when you have concerns.'],
              ['play', 'Play and connect', 'Simple opportunities to enjoy together.'],
              ['watch', 'Notice and learn', 'Observe at your child’s pace; logging is optional.'],
            ] as const
          )
            .map(([sectionId, title, description]) => ({
              id: sectionId,
              title,
              description,
              records: applicable.filter((g) => g.child_section === sectionId),
            }))
            .filter((group) => group.records.length > 0),
        },
    person: p,
    context: c,
    modules: dashboardModules(p, c),
    available_modules: dashboardModules({ ...p, hidden_modules: [] }, c),
    metrics,
    current_guidance: current,
    contextual_guidance: contextual,
    important_dates: personImportantDates(p, now, await getUserTimezone(user)).map((entry) => ({
      ...entry,
      kind: getDateKind(entry),
      ideas: celebrationIdeas(getDateKind(entry)),
    })),
    upcoming,
    recent_activity: past.slice(0, 50),
    goals: events
      .filter((event) => event.type === 'goal')
      .map((event) => ({
        ...event,
        payload: { ...event.payload, goal_status: event.payload.goal_status ?? 'active' },
      })),
    upcoming_events: events
      .filter((e) => Date.parse(e.timestamp) > now.getTime())
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
    sources: peopleSources.filter((s) => ids.has(s.id)),
    shared_time_minutes: unionMinutes(
      past.filter((e) => ['shared_activity', 'care'].includes(e.type)),
      now,
    ),
    guidance_count: applicable.length,
    event_types: [
      ...new Set([
        ...metrics.map((m) => m.event_type),
        'appointment' as const,
        'journal' as const,
        'memory' as const,
      ]),
    ].map((value) => ({
      ...option(value),
      ...(['journal', 'memory', 'goal'].includes(value)
        ? { label: `Add ${option(value).label.toLowerCase()}` }
        : {}),
    })),
    reminders_available: peopleRemindersAvailable(),
    practical_opportunities: untagged
      .filter(
        (g) =>
          g.guidance_type === 'optimization' &&
          !current.some((selected) => selected.id === g.id) &&
          !contextual.some((selected) => selected.id === g.id),
      )
      .slice(0, 3),
    developmental_context: untagged.filter(
      (g) =>
        g.checklist_age_months === c.previous_checklist_months &&
        !current.some((selected) => selected.id === g.id),
    ),
  }
}
export const getMetrics = async (user: string, id: string) => (await getDashboard(user, id)).metrics
const hasGoalText = (event: PeopleEventBody) =>
  Boolean(event.payload.title?.trim() || event.payload.note?.trim())
const validateGoalText = (event: PeopleEventBody, previous?: PeopleEventBody) => {
  if (
    event.type === 'goal' &&
    !hasGoalText(event) &&
    !(previous?.type === 'goal' && !hasGoalText(previous))
  ) {
    throw httpError(400, 'Add a goal title or note.')
  }
}
// eslint-disable-next-line complexity -- Validates independent optional event fields while accepting legacy untyped observations.
const validateEvent = (body: PeopleEventBody, previous?: PeopleEventBody) => {
  const r = peopleEventBodySchema.safeParse(body)
  if (!r.success) throw httpError(400, 'Invalid event.')
  validateGoalText(r.data, previous)
  if (
    ['journal', 'memory'].includes(r.data.type) &&
    ![r.data.payload.title, r.data.payload.location, r.data.payload.note].some((value) =>
      Boolean(value?.trim()),
    )
  ) {
    throw httpError(400, 'Add a title, location, or note to this entry.')
  }
  if (r.data.end_time && Date.parse(r.data.end_time) < Date.parse(r.data.timestamp)) {
    throw httpError(400, 'End time must not precede start time.')
  }
  if (r.data.payload.measurement_type && (r.data.type !== 'growth' || r.data.payload.value === undefined)) {
    throw httpError(400, 'Typed growth measurements require a value and unit.')
  }
  if (r.data.payload.diaper_type && r.data.type !== 'diaper') {
    throw httpError(400, 'Diaper type applies only to diaper entries.')
  }
  const numeric = r.data.payload.value !== undefined
  if (numeric !== Boolean(r.data.payload.unit?.trim())) {
    throw httpError(400, 'Numeric observations require both a value and a unit.')
  }
  if (
    numeric &&
    ((!(r.data.type === 'observation' && r.data.payload.care_metric) &&
      !['feeding', 'growth'].includes(r.data.type)) ||
      r.data.payload.value! < 0)
  ) {
    throw httpError(400, 'Numeric values are nonnegative feeding or growth observations.')
  }
  return r.data
}
const refresh = async (tx: Parameters<typeof db.lockPerson>[0], id: string, now = new Date()) => {
  const events = await db.listEvents(tx, id)
  const points: { metric: string; time: string; value: number; unit: string }[] = events
    .filter(
      (e) =>
        Date.parse(e.timestamp) <= now.getTime() &&
        e.source !== 'system' &&
        !['journal', 'memory'].includes(e.type),
    )
    .map((e) => ({
      metric:
        e.payload.value === undefined
          ? e.type
          : `${e.type}_${createHash('sha256').update(`${e.payload.unit}:${e.id}`).digest('hex').slice(0, 12)}`,
      time: e.timestamp,
      value: e.payload.value ?? 1,
      unit: e.payload.unit ?? 'events',
    }))
  const intervals = events.filter(
    (e) =>
      ['care', 'shared_activity'].includes(e.type) && e.end_time && Date.parse(e.timestamp) <= now.getTime(),
  )
  if (intervals.length) {
    points.push({
      metric: 'elapsed',
      time: intervals.map((e) => e.timestamp).sort()[0],
      value: unionMinutes(intervals, now),
      unit: 'minutes',
    })
  }
  await db.replaceMetricPoints(tx, id, points)
}
/** Observation context is server-owned and survives later profile corrections. */
const setObservationContext = (event: PeopleEventBody, person: Person, previous?: PeopleEventBody) => {
  delete event.payload.observation_age_days
  delete event.payload.guidance_version
  if (event.type !== 'observation') {
    delete event.payload.guidance_id
    return
  }
  const sameObservationTime =
    previous?.type === 'observation' && Date.parse(previous.timestamp) === Date.parse(event.timestamp)
  event.payload.observation_age_days = sameObservationTime
    ? previous.payload.observation_age_days
    : peopleContext(person, new Date(event.timestamp)).age_days
  if (!event.payload.guidance_id) return
  if (previous?.type === 'observation' && event.payload.guidance_id === previous.payload.guidance_id) {
    event.payload.guidance_version = previous.payload.guidance_version
    return
  }
  const guidance = peopleCatalog.find((g) => g.id === event.payload.guidance_id)
  if (!guidance) throw httpError(400, 'Unknown guidance.')
  event.payload.guidance_version = guidance.version
}
export const createEvent = async (user: string, id: string, body: PeopleEventBody) => {
  validatePeopleId(id)
  const event = validateEvent(body)
  validatePeopleReminder(event)
  return db.peopleTransaction(user, async (tx) => {
    if (!(await db.lockPerson(tx, id))) throw httpError(404, 'Person not found.')
    const p = (await db.getPerson(tx, id))!
    validateCareEvent(event, p, peopleMilestones, undefined, await getUserTimezone(user))
    setObservationContext(event, p)
    const result = await db.insertEvent(tx, id, user, event)
    await refresh(tx, id)
    return result
  })
}
export const updateEvent = async (user: string, id: string, eventId: string, body: UpdatePeopleEventBody) => {
  validatePeopleId(id)
  validatePeopleId(eventId)
  const parsed = updatePeopleEventBodySchema.safeParse(body)
  if (!parsed.success) throw httpError(400, 'Invalid event changes.')
  return db.peopleTransaction(user, async (tx) => {
    if (!(await db.lockPerson(tx, id))) throw httpError(404, 'Person not found.')
    const old = (await db.listEvents(tx, id)).find((e) => e.id === eventId)
    if (!old) throw httpError(404, 'Event not found.')
    if (old.source === 'system' || old.type === 'relationship_state') {
      throw httpError(
        409,
        'Relationship history is recorded automatically. Change the profile relationship states instead.',
      )
    }
    const previous = peopleEventBodySchema.parse(old)
    const event = validateEvent(
      {
        ...previous,
        ...parsed.data,
        payload: parsed.data.payload ?? old.payload,
      },
      previous,
    )
    const person = (await db.getPerson(tx, id))!
    validateCareEvent(event, person, peopleMilestones, previous, await getUserTimezone(user))
    setObservationContext(event, person, previous)
    validatePeopleReminder(event, previous)
    const result = (await db.updateEvent(tx, id, eventId, event))!
    await refresh(tx, id)
    return result
  })
}
export const deleteEvent = async (user: string, id: string, eventId: string) => {
  validatePeopleId(id)
  validatePeopleId(eventId)
  return db.peopleTransaction(user, async (tx) => {
    if (!(await db.lockPerson(tx, id))) throw httpError(404, 'Event not found.')
    const old = (await db.listEvents(tx, id)).find((event) => event.id === eventId)
    if (old?.source === 'system' || old?.type === 'relationship_state') {
      throw httpError(
        409,
        'Relationship history is recorded automatically. Change the profile relationship states instead.',
      )
    }
    if (!(await db.deleteEvent(tx, id, eventId))) {
      throw httpError(404, 'Event not found.')
    }
    await refresh(tx, id)
    return { id: eventId }
  })
}
export const setFeedback = async (user: string, id: string, guidanceId: string, body: PeopleFeedbackBody) => {
  await requirePerson(user, id)
  const parsed = peopleFeedbackBodySchema.safeParse(body)
  if (!parsed.success) throw httpError(400, 'Invalid feedback.')
  const guidance = (await getGuidance(user, id)).find((g) => g.id === guidanceId)
  if (!guidance || guidance.version !== body.version) {
    throw httpError(400, 'Guidance is not applicable or its version has changed.')
  }
  await db.saveFeedback(user, id, guidanceId, body)
  return { id: guidanceId }
}
export { peopleSources }

export const getPeopleHelpTree = async (
  user: string,
  query: PeopleHelpTreeQuery = {},
): Promise<PeopleHelpTree> => {
  const result: PeopleHelpTree = {
    age_policy:
      'Developmental guidance expressed in days or months uses configured corrected age before 24 chronological months, except safety/help guidance. Safety/help and age windows expressed in years use chronological age. Pregnancy timing uses only an explicitly supplied gestational estimate or due date, independent of gender.',
    guidance: peopleCatalog,
    sources: peopleSources,
    status_definitions: peopleStatusDefinitions,
    care_metric_definitions: peopleCareMetricDefinitions,
    milestone_definitions: peopleMilestones,
    care_ethics: peopleCareEthics,
  }
  if (query.person_id) {
    const person = await requirePerson(user, query.person_id)
    const now = new Date()
    result.evaluations = evaluatePeopleGuidance(
      person,
      peopleContext(person, now),
      peopleCatalog,
      await db.listEvents(user, person.id),
      now,
      await getUserTimezone(user),
    )
  }
  return result
}
