import type { ProductivityRecord } from '../db/types.ts'

/** Read-time allocation only; source observations are never merged or overwritten. */
export const allocateProductivity = (
  records: ProductivityRecord[],
  start?: Date,
  end?: Date,
): ProductivityRecord[] => {
  const changes: { time: number; record: ProductivityRecord; entering: boolean }[] = []
  for (const record of records) {
    const lo = Math.max(record.start_time.getTime(), start?.getTime() ?? -Infinity)
    const hi = Math.min(record.end_time.getTime(), end?.getTime() ?? Infinity)
    if (hi <= lo) continue
    changes.push({ time: lo, record, entering: true }, { time: hi, record, entering: false })
  }
  changes.sort((a, b) => a.time - b.time)
  const active = new Set<ProductivityRecord>()
  const result: ProductivityRecord[] = []
  let previous = changes[0]?.time ?? 0
  for (const change of changes) {
    if (change.time > previous && active.size) {
      const chosen = [...active].sort(compareProductivity)[0]!
      const last = result.at(-1)
      const duration = (change.time - previous) / 1000
      if (canExtend(last, chosen, previous)) {
        last.end_time = new Date(change.time)
        last.duration_sec += duration
      } else {
        result.push({
          ...chosen,
          start_time: new Date(previous),
          end_time: new Date(change.time),
          duration_sec: duration,
        })
      }
    }
    if (change.entering) active.add(change.record)
    else active.delete(change.record)
    previous = change.time
  }
  return result
}

const categoryKey = (r: ProductivityRecord) => r.resolved_category?.join('\u0000') ?? '\uffff'
const compareProductivity = (a: ProductivityRecord, b: ProductivityRecord) => {
  const ak = categoryKey(a),
    bk = categoryKey(b)
  return (
    (ak < bk ? -1 : ak > bk ? 1 : 0) ||
    a.start_time.getTime() - b.start_time.getTime() ||
    (a.device_name ?? '').localeCompare(b.device_name ?? '') ||
    a.activity.localeCompare(b.activity) ||
    (a.id ?? '').localeCompare(b.id ?? '')
  )
}

const canExtend = (
  last: ProductivityRecord | undefined,
  chosen: ProductivityRecord,
  previous: number,
): last is ProductivityRecord =>
  last !== undefined &&
  last.id === chosen.id &&
  last.activity === chosen.activity &&
  last.source === chosen.source &&
  categoryKey(last) === categoryKey(chosen) &&
  last.device_name === chosen.device_name &&
  last.end_time.getTime() === previous
