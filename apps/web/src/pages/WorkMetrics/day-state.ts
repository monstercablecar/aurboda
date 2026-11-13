import type { QueryMetricsBucketedResponse, WorkProfile } from '@aurboda/api-spec'

import { format } from 'date-fns'

import type { Activity as WorkActivity } from '../../state/api/types'

import {
  dayMarkerMetric,
  normalizeWorkGridValues,
  readWorkDraft,
  workGridFromTotals,
  type WorkDay,
  type WorkGridValues,
} from './model'

export const latestWorkEntry = (entries: WorkActivity[], profileId: string, date: string) =>
  [...entries]
    .filter(
      (entry) =>
        entry.activity_type === 'work_entry' &&
        entry.data?.profile_id === profileId &&
        entry.data?.work_date === date,
    )
    .sort((a, b) =>
      String(b.data?.updated_at ?? b.start_time.toISOString()).localeCompare(
        String(a.data?.updated_at ?? a.start_time.toISOString()),
      ),
    )[0]

const valueFromStats = (stats: { avg: number; sum?: number }) => stats.sum ?? stats.avg

export const responseTotals = (response: QueryMetricsBucketedResponse | undefined) => {
  const totals: Record<string, number> = {}
  for (const bucket of response?.buckets ?? []) {
    for (const [metric, stats] of Object.entries(bucket.metrics)) totals[metric] = valueFromStats(stats)
  }
  return totals
}

export const responseDays = (
  response: QueryMetricsBucketedResponse | undefined,
  markerMetric = dayMarkerMetric,
): WorkDay[] =>
  (response?.buckets ?? [])
    .map((bucket) => ({
      date: format(new Date(bucket.start), 'yyyy-MM-dd'),
      totals: Object.fromEntries(
        Object.entries(bucket.metrics).map(([metric, stats]) => [metric, valueFromStats(stats)]),
      ),
    }))
    .filter((day) => (day.totals[markerMetric] ?? 0) > 0)

interface LoadedWorkDayState {
  note: string
  savedAsCombined: boolean
  status: string
  values: WorkGridValues
}

// eslint-disable-next-line complexity -- combines activity, draft, and metric fallbacks for the active day
export const loadedWorkDayState = (
  profile: WorkProfile,
  response: QueryMetricsBucketedResponse | undefined,
  notes: { content: string }[] | undefined,
  entries: WorkActivity[] | undefined,
  storage: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>,
  draftUser: string,
  date: string,
): LoadedWorkDayState | undefined => {
  if (!response || notes === undefined || entries === undefined) return undefined
  const draft = readWorkDraft(storage, draftUser, date, profile.id)
  if (draft) {
    const values = normalizeWorkGridValues(profile, draft.values)
    if (values) return { note: draft.note, savedAsCombined: false, status: 'Draft restored', values }
  }
  const entry = latestWorkEntry(entries, profile.id, date)
  if (entry?.data?.values) {
    const values = normalizeWorkGridValues(profile, entry.data.values)
    if (values) {
      return {
        note: typeof entry.data.note === 'string' ? entry.data.note : (notes[0]?.content ?? ''),
        savedAsCombined: false,
        status: '',
        values,
      }
    }
  }
  const stored = responseTotals(response)
  const savedAsCombined = (stored[profile.storage_contract.day_marker_metric] ?? 0) > 0
  return {
    note: notes[0]?.content ?? '',
    savedAsCombined,
    status: '',
    values: workGridFromTotals(profile, stored),
  }
}
