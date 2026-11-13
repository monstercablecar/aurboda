import { calculateDerivedTotals } from '@aurboda/api-spec'
export { calculateDerivedTotals, buildStoredTotals } from '@aurboda/api-spec'
import type { AddCustomMetricBody, WorkMetricRow, WorkProfile } from '@aurboda/api-spec'

import {
  dayMarkerMetric,
  derivedMetricNames,
  defaultWorkSettings,
  inputGroups,
  inputMetricNames,
  positions,
  type DerivedMetricKey,
  type WorkInputKey,
  type WorkPosition,
  WORK_METRIC_SOURCE,
} from './settings'

export { dayMarkerMetric, inputGroups, inputMetricNames, positions, WORK_METRIC_SOURCE } from './settings'
export type { DerivedMetricKey, WorkInputKey, WorkPosition } from './settings'

export const WEEKLY_HIRE_GOAL = defaultWorkSettings.weekly_hire_goal
export const positionLabels: Record<WorkPosition, string> = defaultWorkSettings.position_labels

export type PositionValues = Record<WorkInputKey, Record<WorkPosition, number>>
export type WorkGridValues = Record<string, Record<string, number>>
export type InputTotals = Record<WorkInputKey, number>
export type DerivedTotals = Record<DerivedMetricKey, number>
export type StoredTotals = Record<string, number>

export const allStoredMetricNames = [
  ...Object.values(inputMetricNames),
  ...Object.values(derivedMetricNames),
  dayMarkerMetric,
]

const definition = (name: string, description: string): AddCustomMetricBody => ({
  aggregation: 'sum',
  description,
  include_in_daily_summary: false,
  min_value: 0,
  name,
  unit: 'count',
})

export const workMetricDefinitions: AddCustomMetricBody[] = [
  ...inputGroups.flatMap((group) =>
    group.metrics.map((metric) => definition(inputMetricNames[metric.key], `Work: ${metric.label}`)),
  ),
  definition(derivedMetricNames.application_declines, 'Work: applications declined during initial review'),
  definition(derivedMetricNames.applications_reviewed, 'Work: applications reviewed'),
  definition(derivedMetricNames.approval_denials, 'Work: candidates not approved'),
  definition(derivedMetricNames.hires, 'Work: accepted offers / hires'),
  definition(derivedMetricNames.interview_appointments, 'Work: interview appointments decided or missed'),
  definition(derivedMetricNames.interview_decisions, 'Work: completed interviews with a decision'),
  definition(derivedMetricNames.interview_denials, 'Work: candidates denied after interview'),
  definition(derivedMetricNames.offers_decided, 'Work: offers accepted or declined'),
  definition(dayMarkerMetric, 'Work: marker for a completed daily recruiting entry'),
]

export const workMetricDefinitionsForProfile = (profile: WorkProfile): AddCustomMetricBody[] => {
  const unique = new Map<string, AddCustomMetricBody>()
  for (const metric of profile.metric_rows) {
    unique.set(metric.storage_metric, definition(metric.storage_metric, `Work: ${metric.label}`))
  }
  unique.set(
    profile.storage_contract.day_marker_metric,
    definition(profile.storage_contract.day_marker_metric, 'Work: marker for a completed workday'),
  )
  return [...unique.values()]
}

const inputKeys = inputGroups.flatMap((group) => group.metrics.map((metric) => metric.key))

// Archived cells remain in saved snapshots and totals when an older workday is edited.
const storedColumnIds = (profile: WorkProfile): string[] =>
  profile.category_columns.map((column) => column.id)

const storedMetrics = (profile: WorkProfile): WorkMetricRow[] => profile.metric_rows

export const storedMetricNamesForProfile = (profile: WorkProfile): string[] => [
  ...new Set([
    ...storedMetrics(profile).map((metric) => metric.storage_metric),
    profile.storage_contract.day_marker_metric,
  ]),
]

export const createWorkGridValues = (profile: WorkProfile, fill = 0): WorkGridValues =>
  Object.fromEntries(
    storedMetrics(profile).map((metric) => [
      metric.id,
      Object.fromEntries(storedColumnIds(profile).map((columnId) => [columnId, fill])),
    ]),
  ) as WorkGridValues

export const normalizeWorkGridValues = (profile: WorkProfile, value: unknown): WorkGridValues | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const normalized = createWorkGridValues(profile)

  for (const metric of storedMetrics(profile)) {
    const metricValues = source[metric.id]
    if (!metricValues) continue
    if (typeof metricValues !== 'object') return undefined
    for (const columnId of storedColumnIds(profile)) {
      const count = (metricValues as Record<string, unknown>)[columnId]
      if (count === undefined) continue
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return undefined
      normalized[metric.id][columnId] = count
    }
  }

  return normalized
}

export const sumWorkGridValues = (profile: WorkProfile, values: WorkGridValues): Record<string, number> =>
  Object.fromEntries(
    storedMetrics(profile).map((metric) => [
      metric.id,
      storedColumnIds(profile).reduce(
        (total, columnId) => total + (Number(values[metric.id]?.[columnId]) || 0),
        0,
      ),
    ]),
  )

export const workGridFromTotals = (profile: WorkProfile, totals: Record<string, number>): WorkGridValues => {
  const values = createWorkGridValues(profile)
  const firstColumn = storedColumnIds(profile)[0]
  if (!firstColumn) return values
  for (const metric of storedMetrics(profile)) {
    values[metric.id][firstColumn] = totals[metric.storage_metric] ?? 0
  }
  return values
}

interface WorkDraftStorage {
  getItem: (key: string) => string | null
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}

export interface WorkDraft {
  note: string
  values: WorkGridValues
}

const workDraftStorageKey = (username: string, date: string, profileId = 'recruiting'): string =>
  `aurboda.work-metrics.draft.v2:${encodeURIComponent(username || 'current-user')}:${encodeURIComponent(profileId)}:${date}`

const normalizeDraftValues = (value: unknown): PositionValues | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const normalized = emptyPositionValues()

  for (const metric of inputKeys) {
    const metricValues = source[metric]
    if (!metricValues || typeof metricValues !== 'object') return undefined
    for (const position of positions) {
      const count = (metricValues as Record<string, unknown>)[position]
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return undefined
      normalized[metric][position] = count
    }
  }

  return normalized
}

export const readWorkDraft = (
  storage: WorkDraftStorage,
  username: string,
  date: string,
  profileId = 'recruiting',
): WorkDraft | undefined => {
  let key = workDraftStorageKey(username, date, profileId)
  try {
    let saved = storage.getItem(key)
    if (!saved && profileId === 'recruiting') {
      key = `aurboda.work-metrics.draft.v1:${encodeURIComponent(username || 'current-user')}:${date}`
      saved = storage.getItem(key)
    }
    if (!saved) return undefined
    const parsed = JSON.parse(saved) as { note?: unknown; values?: unknown; version?: unknown }
    if (parsed.version === 1 && typeof parsed.note === 'string') {
      const values = normalizeDraftValues(parsed.values)
      if (values) return { note: parsed.note, values }
    }
    if (
      parsed.version === 2 &&
      typeof parsed.note === 'string' &&
      parsed.values &&
      typeof parsed.values === 'object'
    ) {
      return { note: parsed.note, values: parsed.values as WorkGridValues }
    }
    storage.removeItem(key)
    return undefined
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    return undefined
  }
}

export const writeWorkDraft = (
  storage: WorkDraftStorage,
  username: string,
  date: string,
  values: WorkGridValues,
  note: string,
  profileId = 'recruiting',
): void => {
  try {
    storage.setItem(
      workDraftStorageKey(username, date, profileId),
      JSON.stringify({ note, updated_at: new Date().toISOString(), values, version: 2 }),
    )
  } catch {
    // Keep the form usable when browser storage is unavailable.
  }
}

export const deleteWorkDraft = (
  storage: WorkDraftStorage,
  username: string,
  date: string,
  profileId = 'recruiting',
): void => {
  try {
    storage.removeItem(workDraftStorageKey(username, date, profileId))
    if (profileId === 'recruiting') {
      storage.removeItem(
        `aurboda.work-metrics.draft.v1:${encodeURIComponent(username || 'current-user')}:${date}`,
      )
    }
  } catch {
    // Keep the form usable when browser storage is unavailable.
  }
}

export const emptyPositionValues = (): PositionValues =>
  Object.fromEntries(
    inputKeys.map((key) => [key, Object.fromEntries(positions.map((position) => [position, 0]))]),
  ) as PositionValues

export const sumPositionValues = (values: PositionValues): InputTotals =>
  Object.fromEntries(
    inputKeys.map((key) => [
      key,
      positions.reduce((total, position) => total + (Number(values[key][position]) || 0), 0),
    ]),
  ) as InputTotals

export const combinedTotalsToPositionValues = (totals: Partial<InputTotals>): PositionValues => {
  const values = emptyPositionValues()
  for (const key of inputKeys) values[key].server = totals[key] ?? 0
  return values
}

export const shouldCelebrateWorkday = (hires: number): boolean => hires >= 3

export interface WorkRates {
  approval_rate: number | null
  application_to_hire_rate: number | null
  interview_completion_rate: number | null
  interview_to_hire_rate: number | null
  invite_rate: number | null
  no_show_rate: number | null
  offer_acceptance_rate: number | null
  reschedule_rate: number | null
}

const rate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null

const storedValue = (totals: StoredTotals, metric: string): number => totals[metric] ?? 0

export const calculateRates = (totals: StoredTotals): WorkRates => ({
  approval_rate: rate(storedValue(totals, 'work_approved'), storedValue(totals, 'work_sent_for_approval')),
  application_to_hire_rate: rate(
    storedValue(totals, 'work_hires'),
    storedValue(totals, 'work_applications_reviewed'),
  ),
  interview_completion_rate: rate(
    storedValue(totals, 'work_interview_decisions'),
    storedValue(totals, 'work_interview_appointments'),
  ),
  interview_to_hire_rate: rate(
    storedValue(totals, 'work_hires'),
    storedValue(totals, 'work_interview_decisions'),
  ),
  invite_rate: rate(
    storedValue(totals, 'work_invited_to_interview'),
    storedValue(totals, 'work_applications_reviewed'),
  ),
  no_show_rate: rate(
    storedValue(totals, 'work_no_shows'),
    storedValue(totals, 'work_interview_appointments'),
  ),
  offer_acceptance_rate: rate(
    storedValue(totals, 'work_offers_accepted'),
    storedValue(totals, 'work_offers_decided'),
  ),
  reschedule_rate: rate(
    storedValue(totals, 'work_reschedules'),
    storedValue(totals, 'work_interview_appointments'),
  ),
})

export interface WorkDay {
  date: string
  totals: StoredTotals
}

export const sumDays = (days: WorkDay[], markerMetric = dayMarkerMetric): StoredTotals => {
  const result: StoredTotals = {}
  for (const day of days) {
    for (const [metric, value] of Object.entries(day.totals)) {
      if (metric === markerMetric) continue
      result[metric] = (result[metric] ?? 0) + value
    }
  }
  return result
}

export interface WorkWeek {
  hires: number
  label: string
  start: string
}

export interface WorkMetricWeek {
  total: number
  label: string
  start: string
}

export const weeklyMetricTotals = (days: WorkDay[], metric: string): WorkMetricWeek[] => {
  const weeks = new Map<string, number>()
  for (const day of days) {
    const date = new Date(`${day.date}T12:00:00`)
    const weekday = date.getDay()
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday
    date.setDate(date.getDate() + mondayOffset)
    const start = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    weeks.set(start, (weeks.get(start) ?? 0) + (day.totals[metric] ?? 0))
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, total]) => ({
      label: new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      }),
      start,
      total,
    }))
}

export const weeklyHires = (days: WorkDay[]): WorkWeek[] => {
  return weeklyMetricTotals(days, 'work_hires').map(({ total, ...week }) => ({
    ...week,
    hires: total,
  }))
}
