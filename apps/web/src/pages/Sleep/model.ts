import type { AddActivityBody } from '@aurboda/api-spec'

import type { Activity } from '../../state/api'

export const sleepMinutes = (session: Activity): number | null => {
  if (!session.end_time) return null
  const minutes =
    session.total_sleep ??
    session.duration ??
    (session.end_time.getTime() - session.start_time.getTime()) / 60000
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null
}

export const sleepDay = (session: Activity) => session.end_time ?? session.start_time
export const activityId = (session: Activity) => session.id?.replace(/^merged:/, '')
export const sessionLink = (session: Activity) => `/detail/activity/${encodeURIComponent(session.id ?? '')}`

export function napBody(start: string, end: string, now = new Date()): AddActivityBody {
  const from = new Date(start)
  const to = new Date(end)
  if (!start || !end || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new Error('Choose a valid start and end time.')
  }
  if (to <= from) throw new Error('End time must be after start time.')
  if (to > now) throw new Error('A recorded nap cannot end in the future.')
  if (to.getTime() - from.getTime() > 24 * 3600000) {
    throw new Error('Check the dates: a nap cannot exceed 24 hours.')
  }
  return { activity_type: 'nap', start_time: from.toISOString(), end_time: to.toISOString(), title: 'Nap' }
}

export function checkInText(rested: string, waking: string, notes: string): string {
  const lines = [
    rested && `Feeling on waking: ${rested}`,
    waking && `Night awakenings: ${waking}`,
    notes.trim(),
  ].filter(Boolean)
  if (!lines.length) throw new Error('Answer at least one optional question or add a note.')
  return `Sleep check-in\n${lines.join('\n')}`
}

export const isSleepSession = (session: Activity) =>
  session.activity_type === 'sleep' || session.activity_type === 'nap'
