import {
  computeWorkDayTotals,
  resolveActiveWorkProfile,
  workSettingsSchema,
  workDayBodySchema,
  type WorkDayBody,
  type WorkDayResult,
  type WorkProfile,
} from '@aurboda/api-spec'

import type { ActivityNotifier } from './deduction-queue.ts'

import { summarizeAuditError } from '../api/audit-body.ts'
import { withUserTransaction } from '../db/connection.ts'
import { persistWorkDay } from '../db/work-day.ts'
import { httpError } from '../http-error.ts'
import { isValidMetric } from '../schema.ts'
import { auditError } from './audit-log.ts'

export const validateWorkDay = (profile: WorkProfile, body: WorkDayBody) => {
  const rowIds = new Set(profile.metric_rows.map((r) => r.id)),
    columnIds = new Set(profile.category_columns.map((c) => c.id))
  for (const [row, columns] of Object.entries(body.values)) {
    if (!rowIds.has(row)) throw httpError(400, 'Unknown Work row.')
    for (const column of Object.keys(columns)) {
      if (!columnIds.has(column)) throw httpError(400, 'Unknown Work category.')
    }
  }
  if (`${profile.name} · ${body.work_date}`.length > 255) {
    throw httpError(400, 'Work profile name is too long for an entry title.')
  }
  const totals = computeWorkDayTotals(profile, body.values)
  if (Object.keys(totals).some(isValidMetric)) {
    throw httpError(400, 'Work profiles must use custom count metrics, not built-in health metrics.')
  }
  if (
    Object.values(totals).some((v) => !Number.isFinite(v) || v < 0) ||
    Object.keys(totals).some((m) => m.length > 50) ||
    profile.storage_contract.daily_metric_source.length > 50
  ) {
    throw httpError(400, 'Invalid Work metric value or storage identity.')
  }
  if (
    Object.keys(body.totals).length !== Object.keys(totals).length ||
    Object.entries(totals).some(([name, value]) => body.totals[name] !== value)
  ) {
    throw httpError(400, 'Work totals do not match the configured grid. Reload the profile and retry.')
  }
  if (Math.abs(Date.parse(body.timestamp) - Date.parse(`${body.work_date}T12:00:00Z`)) > 14 * 3600000) {
    throw httpError(400, 'Work timestamp must represent noon on the selected date in a supported timezone.')
  }
  return totals
}
export const saveWorkDay = async (
  user: string,
  input: WorkDayBody,
  onMutated?: ActivityNotifier,
): Promise<WorkDayResult> => {
  const parsed = workDayBodySchema.safeParse(input)
  if (!parsed.success) throw httpError(400, 'Invalid Work day.')
  const body = parsed.data
  const result = await withUserTransaction(user, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify(['work-day', body.profile_id, body.work_date]),
    ])
    const settings = await tx.query<{ settings: { work?: unknown } }>(
      'SELECT settings FROM user_settings LIMIT 1 FOR SHARE',
    )
    const stored = settings.rows[0]?.settings.work
    const work = stored == null ? undefined : workSettingsSchema.parse(stored)
    const profile =
      work?.version === 1
        ? work.profiles?.find((p) => p.id === body.profile_id)
        : body.profile_id === 'recruiting'
          ? resolveActiveWorkProfile(work)
          : undefined
    if (!profile) throw httpError(404, 'Work profile not found.')
    return persistWorkDay(tx, profile, body, validateWorkDay(profile, body))
  })
  try {
    await onMutated?.(user, 'work_entry', new Date(result.timestamp), new Date(result.timestamp))
  } catch (error) {
    await auditError(
      user,
      'data',
      'Work day saved but activity notification failed',
      summarizeAuditError(error),
    )
  }
  return result
}
