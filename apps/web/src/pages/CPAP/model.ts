import type { AddCustomMetricBody, BulkMetricItem } from '@aurboda/api-spec'

export const CPAP_SOURCE = 'resmed_myair'
export const CPAP_TIMEZONE = 'America/Denver'
export const cpapFields = [
  ['USAGE_HOURS', 'cpap_usage_hours', 'Usage', 'hours'],
  ['AHI', 'cpap_ahi', 'AHI', 'events/hour'],
  ['LEAK_50_PERCENTILE', 'cpap_leak_50_percentile', 'Leak 50th percentile', 'L/min'],
  ['LEAK_70_PERCENTILE', 'cpap_leak_70_percentile', 'Leak 70th percentile', 'L/min'],
  ['LEAK_95_PERCENTILE', 'cpap_leak_95_percentile', 'Leak 95th percentile', 'L/min'],
  ['MASK_SESSION_COUNT', 'cpap_mask_session_count', 'Mask sessions', 'count'],
  ['SLEEP_SCORE', 'cpap_sleep_score', 'myAir score', 'score'],
  ['AHI_SCORE', 'cpap_ahi_score', 'AHI score', 'score'],
  ['LEAK_SCORE', 'cpap_leak_score', 'Leak score', 'score'],
  ['MASK_SCORE', 'cpap_mask_score', 'Mask score', 'score'],
  ['USAGE_SCORE', 'cpap_usage_score', 'Usage score', 'score'],
] as const
export const cpapMetricDefinitions: AddCustomMetricBody[] = cpapFields.map(([, name, label, unit]) => ({
  name,
  unit,
  description: `ResMed myAir CPAP: ${label}`,
  min_value: 0,
  aggregation: 'avg',
  include_in_daily_summary: false,
}))
export interface CPAPDay {
  date: string
  values: Record<string, number>
}
export interface CPAPPreview {
  days: CPAPDay[]
  data: BulkMetricItem[]
  duplicate_count: number
  deleted_count: number
}

// eslint-disable-next-line complexity -- CSV states must distinguish quoted delimiters, escapes, and CRLF.
function csvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false
  const input = csv.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
        closed = true
      } else field += c
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field)
      field = ''
      closed = false
      if (c !== ',') {
        if (c === '\r' && input[i + 1] === '\n') i++
        if (row.some((value) => value.trim())) rows.push(row)
        row = []
      }
    } else if (c === '"' && field === '' && !closed) quoted = true
    else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting.')
      field += c
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.')
  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  )
}

const denverParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: CPAP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})
export function cpapDate(time: Date): string {
  const parts = Object.fromEntries(denverParts.formatToParts(time).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function cpapDateAtNoon(date: string): string {
  if (!validDate(date)) throw new Error('Invalid session date.')
  const utcNoon = new Date(`${date}T12:00:00Z`)
  const localHour = Number(denverParts.formatToParts(utcNoon).find((p) => p.type === 'hour')?.value)
  return new Date(utcNoon.getTime() + (12 - localHour) * 3_600_000).toISOString()
}

function parseValues(values: Record<string, string>, row: number): Record<string, number> {
  const metrics: Record<string, number> = {}
  for (const [column, metric] of cpapFields) {
    const raw = values[column]
    if (raw === undefined || raw === '') continue
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw))) {
      throw new Error(`Row ${row}: ${column} must be a nonnegative finite number.`)
    }
    metrics[metric] = Number(raw)
  }
  if (metrics.cpap_usage_hours === undefined || metrics.cpap_ahi === undefined) {
    throw new Error(`Row ${row}: USAGE_HOURS and AHI are required.`)
  }
  return metrics
}

function parseUpdateTime(rawUpdate: string, row: number): number {
  let updated = Number.NEGATIVE_INFINITY
  if (rawUpdate) {
    if (
      !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(rawUpdate) ||
      !validDate(rawUpdate.slice(0, 10)) ||
      Number(rawUpdate.slice(11, 13)) > 23 ||
      Number(rawUpdate.slice(14, 16)) > 59 ||
      Number(rawUpdate.slice(17, 19)) > 59
    ) {
      throw new Error(`Row ${row}: invalid DATA_UPDATE_TIME.`)
    }
    const normalized = rawUpdate.replace(' ', 'T')
    updated = Date.parse(/[Z+-]/.test(normalized.slice(19)) ? normalized : `${normalized}Z`)
    if (!Number.isFinite(updated)) throw new Error(`Row ${row}: invalid DATA_UPDATE_TIME.`)
  }
  return updated
}

export function parseCPAPCsv(csv: string): CPAPPreview {
  const [headers, ...rows] = csvRows(csv)
  if (!headers) throw new Error('The CSV is empty.')
  const names = headers.map((value) => value.trim().toUpperCase())
  if (new Set(names).size !== names.length) throw new Error('Duplicate CSV column names.')
  for (const column of ['SESSION_DATE', 'USAGE_HOURS', 'AHI']) {
    if (!names.includes(column)) throw new Error(`Missing ${column} column. Select SLEEP_RECORD.csv.`)
  }
  const byDate = new Map<string, { day: CPAPDay; updated: number }>()
  let deleted_count = 0,
    duplicate_count = 0
  rows.forEach((row, index) => {
    if (row.length !== names.length) throw new Error(`Row ${index + 2}: incorrect column count.`)
    const values = Object.fromEntries(names.map((name, i) => [name, row[i].trim()]))
    const deleted =
      values.RECORD_DELETE_IND ?? values.IS_DELETED ?? values.DELETED ?? values.DELETE_FLAG ?? ''
    if (['1', 'true', 'yes', 'y'].includes(deleted.toLowerCase())) {
      deleted_count++
      return
    }
    const date = values.SESSION_DATE
    if (!validDate(date)) throw new Error(`Row ${index + 2}: invalid SESSION_DATE.`)
    const metrics = parseValues(values, index + 2)
    const updated = parseUpdateTime(values.DATA_UPDATE_TIME ?? '', index + 2)
    const existing = byDate.get(date)
    if (existing) duplicate_count++
    // Zone-less export update times are ranked as UTC; ties use the last CSV row.
    if (!existing || updated >= existing.updated) {
      byDate.set(date, { day: { date, values: metrics }, updated })
    }
  })
  const days = [...byDate.values()].map(({ day }) => day).sort((a, b) => a.date.localeCompare(b.date))
  if (!days.length) throw new Error('No active CPAP records found.')
  return {
    days,
    duplicate_count,
    deleted_count,
    data: days.flatMap((day) =>
      Object.entries(day.values).map(([metric, value]) => ({
        metric,
        value,
        time: cpapDateAtNoon(day.date),
      })),
    ),
  }
}

export function cpapHistory(
  points: { metric: string; source: string; time: Date; value: number }[],
): CPAPDay[] {
  const days = new Map<string, CPAPDay>()
  for (const point of points) {
    if (point.source !== CPAP_SOURCE) continue
    const date = cpapDate(point.time)
    const day = days.get(date) ?? { date, values: {} }
    day.values[point.metric] = point.value
    days.set(date, day)
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date))
}
