import type { TreatmentCheckin, TreatmentCheckinPlanBody, TreatmentSession } from '@aurboda/api-spec'

export const HOUR = 3_600_000
export const checkinWindow = (
  kind: TreatmentCheckin['kind'],
  session: TreatmentSession,
  offsetHours = 0,
  windowHours = 24,
): { due: Date | null; expires: Date | null } => {
  if (['current', 'reflection'].includes(kind)) return { due: null, expires: null }
  if (kind === 'before') {
    const planned = session.planned_at ? new Date(session.planned_at).getTime() : null
    const start = session.actual_start ? new Date(session.actual_start).getTime() : null
    return {
      due: planned === null ? null : new Date(planned - HOUR),
      expires: start !== null ? new Date(start) : planned === null ? null : new Date(planned + 6 * HOUR),
    }
  }
  if (!session.actual_end) return { due: null, expires: null }
  const end = new Date(session.actual_end).getTime()
  const hours = kind === 'after' ? 1 : kind === 'next_day' ? 24 : offsetHours
  const window = kind === 'after' ? 23 : kind === 'next_day' ? 24 : windowHours
  return { due: new Date(end + hours * HOUR), expires: new Date(end + (hours + window) * HOUR) }
}

export const afterQuietHours = (
  at: Date,
  timezone: string,
  plan: Pick<TreatmentCheckinPlanBody, 'quiet_start' | 'quiet_end'>,
): Date => {
  if (plan.quiet_start === plan.quiet_end) return at
  const local = Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(timezone)
  const clock = local.toPlainTime()
  const start = Temporal.PlainTime.from(plan.quiet_start)
  const end = Temporal.PlainTime.from(plan.quiet_end)
  const overnight = Temporal.PlainTime.compare(start, end) > 0
  const afterStart = Temporal.PlainTime.compare(clock, start) >= 0
  const beforeEnd = Temporal.PlainTime.compare(clock, end) < 0
  if (!(overnight ? afterStart || beforeEnd : afterStart && beforeEnd)) return at
  const day = overnight && afterStart ? local.toPlainDate().add({ days: 1 }) : local.toPlainDate()
  return new Date(
    Number(
      day.toPlainDateTime(end).toZonedDateTime(timezone, { disambiguation: 'compatible' }).epochMilliseconds,
    ),
  )
}

export const initialReminder = (
  due: Date | null,
  expires: Date | null,
  now: Date,
  timezone: string,
  plan: TreatmentCheckinPlanBody,
): Date | null => {
  if (!plan.reminders_enabled || !due || !expires || expires <= now || due.getTime() < now.getTime() - HOUR) {
    return null
  }
  const candidate = afterQuietHours(new Date(Math.max(due.getTime(), now.getTime())), timezone, plan)
  return candidate < expires ? candidate : null
}
