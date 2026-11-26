import type { AdhdObservation, AdhdRecord, AdhdSettings } from '@aurboda/api-spec'

export const inClockWindow = (clock: string, start: string, end: string) =>
  start === end ? false : start < end ? clock >= start && clock < end : clock >= start || clock < end

export const localParts = (at: Date, zone: string) => {
  const value = Temporal.Instant.from(at.toISOString()).toZonedDateTimeISO(zone)
  return {
    date: value.toPlainDate().toString(),
    clock: value.toPlainTime().toString().slice(0, 5),
    hour: value.hour,
    offset: value.offset,
  }
}
export const resolvedWindow = (date: string, clock: string, zone: string) => {
  try {
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute] = clock.split(':').map(Number)
    const start = Temporal.ZonedDateTime.from(
      { year, month, day, hour, minute, timeZone: zone },
      { disambiguation: 'reject' },
    )
    return {
      start: start.toInstant().toString(),
      end: start.add({ minutes: 30 }).toInstant().toString(),
      offset: start.offset,
    }
  } catch {
    return null
  }
}
export const comparableForHour = (o: AdhdObservation) =>
  o.scope === 'current' && o.precision === 'minute' && !['retrospective', 'imported'].includes(o.sampling)
export const hourCoverage = (observations: AdhdObservation[], zone: string) => {
  const bins = Array.from({ length: 8 }, (_, i) => ({
    from: i * 3,
    to: i * 3 + 3,
    n: 0,
    days: new Set<string>(),
    clarity: [] as number[],
  }))
  for (const o of observations.filter(comparableForHour)) {
    const local = localParts(new Date(o.observed_at), zone),
      bin = bins[Math.floor(local.hour / 3)]
    bin.n++
    bin.days.add(local.date)
    if (typeof o.answers.clarity_now_v1 === 'number') bin.clarity.push(o.answers.clarity_now_v1)
  }
  return bins.map((b) => ({ ...b, days: b.days.size, clarity_median: median(b.clarity) }))
}
export const median = (values: number[]): number | null => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b),
    mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
export const armSummary = (records: AdhdRecord[]) =>
  ['intervention', 'usual'].map((condition) => {
    const rows = records.filter((r) => r.kind === 'opportunity' && r.data.condition === condition)
    const outcomes = rows.map((r) => r.data.outcome as Record<string, unknown> | undefined)
    const known = outcomes.filter((o) => o?.within_five_minutes === 'yes' || o?.within_five_minutes === 'no')
    return {
      condition,
      assigned: rows.length,
      exposed: rows.filter((r) => r.data.action_window_started_at).length,
      used: rows.filter((r) => r.data.used && !['none', 'unrecorded'].includes(String(r.data.used))).length,
      declined: rows.filter((r) => r.data.declined).length,
      starts: known.filter((o) => o?.within_five_minutes === 'yes').length,
      known: known.length,
      missing: rows.length - known.length,
      interrupted: outcomes.filter((o) => o && o.interruption !== 'none' && o.interruption !== 'unknown')
        .length,
      days: new Set(rows.map((r) => r.data.local_date)).size,
    }
  })

export const adhdInvitationAllowed = (
  preferences: AdhdSettings,
  invitation: Record<string, unknown>,
  now: Date,
): boolean => {
  if (preferences.paused || !preferences.reminders_enabled) return false
  if (new Date(String(invitation.end)) <= now) return false
  if (invitation.protocol_ends_at && new Date(String(invitation.protocol_ends_at)) <= now) return false
  const clock = localParts(now, preferences.timezone).clock
  if (inClockWindow(clock, preferences.quiet_start, preferences.quiet_end)) return false
  if (invitation.awake_start && invitation.awake_end) {
    const awakeClock = localParts(now, String(invitation.awake_timezone ?? preferences.timezone)).clock
    if (!inClockWindow(awakeClock, String(invitation.awake_start), String(invitation.awake_end))) return false
  }
  return true
}
