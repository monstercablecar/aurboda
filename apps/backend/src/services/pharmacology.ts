import type {
  AdministrationEvent,
  ConfirmRegimenBody,
  CreateAdministrationBody,
  CreateContextEventBody,
  CreateContextEventTypeBody,
  CreateQuestionnaireBody,
  CreateRegimenBody,
  CreateSubstanceBody,
  CreateTreatmentSessionBody,
  CreateTreatmentTypeBody,
  CorrectAssessmentBody,
  DueState,
  InsightsResponse,
  PharmacologyTimelineEntry,
  Regimen,
  ScheduleRule,
  SubmitAssessmentBody,
  TodayResponse,
  UpdateAdministrationBody,
  UpdateContextEventBody,
  UpdateContextEventTypeBody,
  UpdateQuestionnaireBody,
  UpdateRegimenBody,
  UpdateSubstanceBody,
  UpdateTreatmentSessionBody,
  UpdateTreatmentTypeBody,
} from '@aurboda/api-spec'

import * as db from '../db/pharmacology.ts'

export const isActualExposureStatus = db.exposureStatus
export const deterministicAdministrationKey = (requestKey: string, itemId: string): string => `${requestKey}:${itemId}`

const dateNumber = (localDate: string): number => new Date(`${localDate}T00:00:00Z`).getTime()
const isoWeekday = (localDate: string): number => {
  const day = new Date(`${localDate}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}
const inRange = (rule: ScheduleRule, localDate: string): boolean =>
  (!('start_date' in rule) || !rule.start_date || localDate >= rule.start_date) &&
  (!('end_date' in rule) || !rule.end_date || localDate <= rule.end_date)

const timeZoneParts = (instant: Date, timezone: string): Record<string, number> =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  )

export const localDateTimeToInstant = (localDate: string, localTime: string, timezone: string): Date => {
  const [year, month, day] = localDate.split('-').map(Number)
  const [hour, minute, second = 0] = localTime.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute, second)
  let candidate = new Date(target)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = timeZoneParts(candidate, timezone)
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    candidate = new Date(candidate.getTime() + target - represented)
  }
  return candidate
}

export const scheduleAppliesOnDate = (
  rule: ScheduleRule,
  localDate: string,
  timezone = 'UTC',
): boolean => {
  if (!inRange(rule, localDate)) return false
  switch (rule.type) {
    case 'daily': return true
    case 'weekdays': return rule.weekdays.includes(isoWeekday(localDate))
    case 'every_n_days': return localDate >= rule.anchor_date && Math.floor((dateNumber(localDate) - dateNumber(rule.anchor_date)) / 86_400_000) % rule.interval_days === 0
    case 'weekly': return isoWeekday(localDate) === rule.weekday
    case 'monthly': return Number(localDate.slice(8, 10)) === rule.day_of_month
    case 'specific_date': return localDate === rule.date
    case 'interval': {
      const start = localDateTimeToInstant(localDate, '00:00:00', timezone).getTime()
      const nextDate = new Date(dateNumber(localDate) + 86_400_000).toISOString().slice(0, 10)
      const end = localDateTimeToInstant(nextDate, '00:00:00', timezone).getTime()
      const anchor = new Date(rule.anchor_at).getTime()
      const interval = rule.interval_hours * 3_600_000
      const first = anchor >= start ? anchor : anchor + Math.ceil((start - anchor) / interval) * interval
      return first < end
    }
    case 'as_needed':
    case 'none': return false
  }
}

export const listSubstances = db.listSubstances
export const getSubstance = db.getSubstance
export const createSubstance = (user: string, input: CreateSubstanceBody) => db.createSubstance(user, input)
export const updateSubstance = (user: string, id: string, input: UpdateSubstanceBody) => db.updateSubstance(user, id, input)
export const archiveSubstance = db.archiveSubstance
export const listRegimens = db.listRegimens
export const getRegimen = db.getRegimen
export const createRegimen = (user: string, input: CreateRegimenBody) => db.createRegimen(user, input)
export const updateRegimen = (user: string, id: string, input: UpdateRegimenBody) => db.updateRegimen(user, id, input)
export const archiveRegimen = db.archiveRegimen
export const listAdministrations = db.listAdministrations
export const createAdministration = (user: string, input: CreateAdministrationBody) => db.createAdministration(user, input)
export const updateAdministration = (user: string, id: string, input: UpdateAdministrationBody) => db.updateAdministration(user, id, input)
export const voidAdministration = db.voidAdministration
export const confirmRegimen = (user: string, id: string, input: ConfirmRegimenBody) => db.confirmRegimenItems(user, id, input)
export const listTreatmentTypes = db.listTreatmentTypes
export const createTreatmentType = (user: string, input: CreateTreatmentTypeBody) => db.createTreatmentType(user, input)
export const updateTreatmentType = (user: string, id: string, input: UpdateTreatmentTypeBody) => db.updateTreatmentType(user, id, input)
export const listTreatments = db.listTreatmentSessions
export const getTreatment = db.getTreatmentSession
export const createTreatment = (user: string, input: CreateTreatmentSessionBody) => db.createTreatmentSession(user, input)
export const updateTreatment = (user: string, id: string, input: UpdateTreatmentSessionBody) => db.updateTreatmentSession(user, id, input)
export const deleteTreatment = db.deleteTreatmentSession
export const listQuestionnaires = db.listQuestionnaires
export const createQuestionnaire = (user: string, input: CreateQuestionnaireBody) => db.createQuestionnaire(user, input)
export const updateQuestionnaire = (user: string, id: string, input: UpdateQuestionnaireBody) => db.updateQuestionnaire(user, id, input)
export const listAssessments = db.listAssessments
export const submitAssessment = (user: string, input: SubmitAssessmentBody) => db.createAssessment(user, input)
export const correctAssessment = (user: string, id: string, input: CorrectAssessmentBody) => db.updateAssessment(user, id, input)
export const deleteAssessment = db.deleteAssessment
export const listContextTypes = db.listContextEventTypes
export const createContextType = (user: string, input: CreateContextEventTypeBody) => db.createContextEventType(user, input)
export const updateContextType = (user: string, id: string, input: UpdateContextEventTypeBody) => db.updateContextEventType(user, id, input)
export const listContextEvents = db.listContextEvents
export const createContextEvent = (user: string, input: CreateContextEventBody) => db.createContextEvent(user, input)
export const updateContextEvent = (user: string, id: string, input: UpdateContextEventBody) => db.updateContextEvent(user, id, input)
export const deleteContextEvent = db.deleteContextEvent

const dueItems = (regimen: Regimen, localDate: string, timezone: string) =>
  (regimen.start_date && regimen.start_date > localDate) || (regimen.end_date && regimen.end_date < localDate)
    ? []
    : regimen.items.filter((item) => !item.paused && (!item.start_date || item.start_date <= localDate) && (!item.end_date || item.end_date >= localDate) && scheduleAppliesOnDate(item.schedule_override ?? regimen.schedule, localDate, timezone))

const dueState = (statuses: string[], dueCount: number, future: boolean): DueState => {
  if (statuses.length === 0) return future ? 'not_yet_due' : 'pending'
  if (statuses.length < dueCount) return 'partial'
  if (statuses.every((status) => status === 'skipped' || status === 'canceled')) return 'skipped'
  if (statuses.every((status) => status === 'unknown')) return 'unknown'
  if (statuses.some((status) => status === 'skipped' || status === 'canceled' || status === 'unknown')) return 'partial'
  return 'confirmed'
}

const completionDate = (event: AdministrationEvent, item: Regimen['items'][number], timezone: string): string => {
  const actual = new Date(event.administered_at)
  const date = db.localDateForInstant(actual, timezone)
  const scheduledHour = event.scheduled_at
    ? timeZoneParts(new Date(event.scheduled_at), timezone).hour
    : Number(item.scheduled_local_time?.split(':')[0] ?? -1)
  if (scheduledHour >= 18 && timeZoneParts(actual, timezone).hour < 6) {
    return new Date(dateNumber(date) - 86_400_000).toISOString().slice(0, 10)
  }
  return date
}

export const getToday = async (user: string, timezone: string, requestedDate?: string): Promise<TodayResponse['data']> => {
  const now = new Date()
  const currentDate = db.localDateForInstant(now, timezone)
  const localDate = requestedDate ?? currentDate
  const start = localDateTimeToInstant(localDate, '00:00:00', timezone)
  const nextDate = new Date(dateNumber(localDate) + 86_400_000).toISOString().slice(0, 10)
  const end = localDateTimeToInstant(nextDate, '00:00:00', timezone)
  const bedtimeEnd = localDateTimeToInstant(nextDate, '06:00:00', timezone)
  const [regimens, administrations, questionnaires, assessments, treatments] = await Promise.all([
    db.listRegimens(user, 'active'), db.listAdministrations(user, start.toISOString(), bedtimeEnd.toISOString(), 1000),
    db.listQuestionnaires(user), db.listAssessments(user, start.toISOString(), end.toISOString(), 1000),
    db.listTreatmentSessions(user, start.toISOString(), new Date(end.getTime() + 7 * 86_400_000).toISOString(), 100),
  ])
  const inSelectedDay = (timestamp: string) => {
    const instant = new Date(timestamp).getTime()
    return instant >= start.getTime() && instant < end.getTime()
  }
  const dayAdministrations = administrations.filter((event) => inSelectedDay(event.administered_at))
  const dayAssessments = assessments.filter((assessment) => inSelectedDay(assessment.assessed_at))
  const due_regimens = regimens.flatMap((regimen) => {
    const items = dueItems(regimen, localDate, timezone)
    if (items.length === 0) return []
    const itemsById = new Map(items.map((item) => [item.id, item]))
    const itemEvents = administrations
      .filter((event) => {
        const item = event.regimen_item_id ? itemsById.get(event.regimen_item_id) : undefined
        return item && !event.deleted_at && event.status !== 'entered_in_error' && completionDate(event, item, timezone) === localDate
      })
      .sort((a, b) => new Date(b.administered_at).getTime() - new Date(a.administered_at).getTime() ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const latestByItem = new Map<string, (typeof itemEvents)[number]>()
    for (const event of itemEvents) {
      if (event.regimen_item_id && !latestByItem.has(event.regimen_item_id)) latestByItem.set(event.regimen_item_id, event)
    }
    const confirmed = [...latestByItem.keys()]
    const isFuture = (item: Regimen['items'][number]) =>
      localDate > currentDate || (localDate === currentDate && !!item.scheduled_local_time &&
        localDateTimeToInstant(localDate, item.scheduled_local_time, timezone) > now)
    const incomplete = items.filter((item) => !confirmed.includes(item.id) &&
      (localDate < currentDate || (localDate === currentDate && Boolean(item.scheduled_local_time) && !isFuture(item))))
      .map((item) => item.id)
    const future = items.every(isFuture)
    return [{ regimen: { ...regimen, items }, state: dueState([...latestByItem.values()].map((event) => event.status), items.length, future), confirmed_item_ids: confirmed, incomplete_item_ids: incomplete }]
  })
  return {
    timezone, date: localDate, due_regimens,
    assessment_completion: questionnaires.filter((template) => template.enabled).map((template) => ({ template_id: template.id, completed: dayAssessments.some((assessment) => assessment.template_id === template.id) })),
    upcoming_treatments: treatments
      .filter((session): session is typeof session & { planned_at: string } => session.status === 'planned' && !session.actual_start && !session.actual_end &&
        !!session.planned_at && new Date(session.planned_at).getTime() >= (localDate === currentDate ? now.getTime() : start.getTime()))
      .sort((a, b) => new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime()),
    recent_administrations: dayAdministrations.slice(0, 20),
    incomplete_items: due_regimens.flatMap((entry) => entry.incomplete_item_ids.map((item_id) => ({ regimen_id: entry.regimen.id, item_id }))),
  }
}

export const getTimeline = async (user: string, start: string, end: string, limit = 500): Promise<PharmacologyTimelineEntry[]> => {
  const [administrations, treatments, assessments, contexts] = await Promise.all([
    db.listAdministrations(user, start, end, limit), db.listTreatmentSessions(user, start, end, limit),
    db.listAssessments(user, start, end, limit), db.listContextEvents(user, start, end, limit),
  ])
  return [
    ...administrations.map((data): PharmacologyTimelineEntry => ({ type: 'administration', at: data.administered_at, data })),
    ...treatments.map((data): PharmacologyTimelineEntry => ({ type: 'treatment', at: data.actual_start ?? data.planned_at ?? data.created_at, data })),
    ...assessments.map((data): PharmacologyTimelineEntry => ({ type: 'assessment', at: data.assessed_at, data })),
    ...contexts.map((data): PharmacologyTimelineEntry => ({ type: 'context', at: data.started_at, data })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

export const getInsights = async (user: string, timezone: string, start?: string, end?: string): Promise<InsightsResponse['data']> => {
  const endDate = end ?? db.localDateForInstant(new Date(), timezone)
  const startDate = start ?? new Date(dateNumber(endDate) - 29 * 86_400_000).toISOString().slice(0, 10)
  const data = await db.getPharmacologyInsightData(user, startDate, endDate, timezone)
  const coverage_days = data.exposure_days
  const warnings: string[] = []
  if (data.duplicate_suspicions > 0) warnings.push(`${data.duplicate_suspicions} possible duplicate administration group(s) need review.`)
  if (data.missing_assessment_days > 0) warnings.push(`${data.missing_assessment_days} day(s) have no assessment; missing data is not interpreted as a negative response.`)
  if (data.mixed_route_substances.length > 0) warnings.push(`Mixed administration routes are present for: ${data.mixed_route_substances.join(', ')}. Dose summaries do not imply route equivalence.`)
  return { range: { start: startDate, end: endDate, timezone }, coverage_days,
    administration_events: data.administration_events, exposure_events: data.exposure_events,
    concurrent_exposure_days: data.concurrent_exposure_days, missing_assessment_days: data.missing_assessment_days,
    duplicate_suspicions: data.duplicate_suspicions, projected_metrics: data.projected_metrics, warnings,
    disclaimer: 'Observational summary only. Associations do not establish causality and this is not medical advice or clinical decision support.' }
}

export const exportPharmacology = db.exportPharmacology
const csvCell = (value: unknown): string => `"${String(value ?? '').replaceAll('"', '""')}"`
export const exportPharmacologyCsv = async (user: string): Promise<string> => {
  const exported = await db.exportPharmacology(user)
  const rows = ['table,id,data']
  for (const [table, values] of Object.entries(exported)) {
    if (!Array.isArray(values)) continue
    for (const value of values as Array<Record<string, unknown>>) rows.push([csvCell(table), csvCell(value.id), csvCell(JSON.stringify(value))].join(','))
  }
  return `${rows.join('\n')}\n`
}
