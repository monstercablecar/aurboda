export const WEEKDAYS = [
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
  { day: 7, short: 'Sun' },
] as const

export const ALL_DAYS = WEEKDAYS.map((w) => w.day)

const STEP_MINUTES = 5
const MINUTES_PER_DAY = 24 * 60
const sameDays = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((day, i) => day === b[i])

/** "Every day", "Weekdays", "Weekends", "Mon, Wed, Fri". */
export const weekdaysLine = (weekdays: readonly number[]): string => {
  const days = [...new Set(weekdays)].sort((a, b) => a - b)
  return sameDays(days, ALL_DAYS)
    ? 'Every day'
    : sameDays(days, [1, 2, 3, 4, 5])
      ? 'Weekdays'
      : sameDays(days, [6, 7])
        ? 'Weekends'
        : days.map((day) => WEEKDAYS[day - 1]?.short ?? String(day)).join(', ')
}

/** "08:00", "08:00 and 21:00", "08:00, 12:00 and 21:00", in time order. */
export const timesLine = (times: readonly string[]): string => {
  const sorted = [...new Set(times)].sort()
  return sorted.length <= 1 ? (sorted[0] ?? '') : `${sorted.slice(0, -1).join(', ')} and ${sorted.at(-1)}`
}

/** "Every day at 20:00", "Weekdays at 07:30", "Mon, Wed, Fri at 07:30", "Every day at 08:00 and 21:00". */
export const scheduleLine = (times: string | readonly string[], weekdays: readonly number[]): string =>
  `${weekdaysLine(weekdays)} at ${timesLine(typeof times === 'string' ? [times] : times)}`

/** Rounds HH:MM to the nearest five minutes (23:58 becomes 00:00). Null when it is not a time. */
export const roundTime = (value: string): string | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const rounded = (Math.round((hours * 60 + minutes) / STEP_MINUTES) * STEP_MINUTES) % MINUTES_PER_DAY
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`
}

export const toggleDay = (weekdays: readonly number[], day: number): number[] =>
  weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort((a, b) => a - b)
