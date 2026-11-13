import type { WorkDayBody, WorkDayResult, WorkProfile } from '@aurboda/api-spec'

import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Queryable } from './pool.ts'

import { httpError } from '../http-error.ts'

type Entry = {
  id: string
  start_time: Date
  data: Record<string, unknown>
  deleted_at: Date | null
  superseded_by: string | null
}
const saveOwnedNote = async (
  tx: Queryable,
  entityType: string,
  entityId: string,
  content: string,
  time: Date,
  ownedId: unknown,
  legacyContent: unknown,
) => {
  const existing = await tx.query<{ id: string }>(
    `SELECT id FROM notes WHERE entity_type=$1 AND entity_id=$2 AND (source='work_day' OR (source IS NULL AND content=$4 AND id=(SELECT id FROM notes WHERE entity_type=$1 AND entity_id=$2 AND source IS NULL ORDER BY created_at,id LIMIT 1))) ORDER BY CASE WHEN id::text=$3 THEN 0 WHEN source='work_day' THEN 1 ELSE 2 END,created_at,id LIMIT 1 FOR UPDATE`,
    [
      entityType,
      entityId,
      typeof ownedId === 'string' ? ownedId : null,
      typeof legacyContent === 'string' && legacyContent ? legacyContent : null,
    ],
  )
  const id = existing.rows[0]?.id
  if (!content) {
    if (id) await tx.query('DELETE FROM notes WHERE id=$1', [id])
    return undefined
  }
  if (id) {
    await tx.query(
      "UPDATE notes SET content=$2,source='work_day',start_time=$3,updated_at=CASE WHEN content IS DISTINCT FROM $2 THEN NOW() ELSE updated_at END WHERE id=$1",
      [id, content, time],
    )
    return id
  }
  const created = await tx.query<{ id: string }>(
    "INSERT INTO notes(entity_type,entity_id,content,source,start_time) VALUES($1,$2,$3,'work_day',$4) RETURNING id",
    [entityType, entityId, content, time],
  )
  return created.rows[0].id
}
const writeWorkMetrics = async (
  tx: Queryable,
  totals: Record<string, number>,
  time: Date,
  source: string,
) => {
  for (const [metric, value] of Object.entries(totals)) {
    await tx.query(
      "INSERT INTO custom_metrics(name,unit,min_value,aggregation) VALUES($1,'count',0,'sum') ON CONFLICT(name) DO NOTHING",
      [metric],
    )
    const definition = await tx.query<{ unit: string; min_value: number | null; max_value: number | null }>(
      'SELECT unit,min_value,max_value FROM custom_metrics WHERE name=$1',
      [metric],
    )
    const range = definition.rows[0]
    if (
      range.unit !== 'count' ||
      (range.min_value !== null && value < range.min_value) ||
      (range.max_value !== null && value > range.max_value)
    ) {
      throw httpError(400, 'A Work total is outside its configured metric range.')
    }
    const result = await tx.query(
      `INSERT INTO time_series(time,metric,value,unit,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT(time,metric,source) DO UPDATE SET value=EXCLUDED.value,updated_at=CASE WHEN time_series.value IS DISTINCT FROM EXCLUDED.value THEN NOW() ELSE time_series.updated_at END WHERE time_series.deleted_at IS NULL RETURNING time`,
      [time, metric, value, range.unit, source],
    )
    if (!result.rowCount) {
      throw httpError(409, 'A Work metric was deleted. Restore it explicitly before saving.')
    }
  }
}
const canonicalWorkTimestamp = async (
  tx: Queryable,
  existing: Entry | undefined,
  body: WorkDayBody,
  marker: string,
  source: string,
) => {
  let time = existing?.start_time ?? new Date(body.timestamp)
  if (!existing) {
    const noon = Date.parse(`${body.work_date}T12:00:00Z`),
      span = 14 * 3600000
    const markers = await tx.query<{ time: Date; deleted_at: Date | null }>(
      'SELECT time,deleted_at FROM time_series WHERE metric=$1 AND source=$2 AND time >= $3 AND time <= $4 ORDER BY time FOR UPDATE',
      [marker, source, new Date(noon - span), new Date(noon + span)],
    )
    if (markers.rows.length > 1) {
      throw httpError(409, 'Multiple historical Work timestamps match this date; review them before saving.')
    }
    if (markers.rows[0]?.deleted_at) {
      throw httpError(409, 'The Work day marker was deleted. Restore it explicitly before saving.')
    }
    time = markers.rows[0]?.time ?? time
  }
  return time
}
export const persistWorkDay = async (
  tx: Queryable,
  profile: WorkProfile,
  body: WorkDayBody,
  totals: Record<string, number>,
): Promise<WorkDayResult> => {
  const source = profile.storage_contract.daily_metric_source,
    marker = profile.storage_contract.day_marker_metric
  const externalId = `work-day:${createHash('sha256')
    .update(JSON.stringify([profile.id, body.work_date]))
    .digest('hex')}`
  const matches = await tx.query<Entry>(
    `SELECT id,start_time,data,deleted_at,superseded_by FROM activities WHERE source='aurboda' AND activity_type='work_entry' AND (external_id=$3 OR ((data->>'profile_id'=$1 OR ($1='recruiting' AND data->>'profile_id' IS NULL)) AND data->>'work_date'=$2)) ORDER BY CASE WHEN external_id=$3 THEN 0 ELSE 1 END,COALESCE(data->>'updated_at',start_time::text) DESC,id LIMIT 1 FOR UPDATE`,
    [profile.id, body.work_date, externalId],
  )
  const existing = matches.rows[0]
  if (existing?.deleted_at || existing?.superseded_by) {
    throw httpError(409, 'This Work entry was deleted or superseded. Review it explicitly before saving.')
  }
  const time = await canonicalWorkTimestamp(tx, existing, body, marker, source)
  await writeWorkMetrics(tx, totals, time, source)
  const id = existing?.id ?? randomUUID(),
    note = body.note.trim(),
    old = existing?.data ?? {}
  const metricNote = await saveOwnedNote(
    tx,
    'metric',
    `${time.toISOString()}|${marker}|${source}`,
    note,
    time,
    old.work_metric_note_id,
    old.note,
  )
  const activityNote = await saveOwnedNote(
    tx,
    'activity',
    id,
    note,
    time,
    old.work_activity_note_id,
    old.note,
  )
  const data: Record<string, unknown> = {
    ...old,
    note,
    profile_id: profile.id,
    profile_name: profile.name,
    values: body.values,
    work_date: body.work_date,
    work_metric_note_id: metricNote,
    work_activity_note_id: activityNote,
  }
  if (!existing || !isDeepStrictEqual(JSON.parse(JSON.stringify(data)), old)) {
    data.updated_at = new Date().toISOString()
  }
  await tx.query(
    "INSERT INTO activity_type_definitions(name,display_name,display_category,show_on_timeline) VALUES('work_entry','Work entry','productivity',false) ON CONFLICT(name) DO NOTHING",
  )
  if (existing) {
    await tx.query('UPDATE activities SET data=$2,title=$3 WHERE id=$1', [
      id,
      data,
      `${profile.name} · ${body.work_date}`,
    ])
  } else {
    await tx.query(
      "INSERT INTO activities(id,source,external_id,activity_type,start_time,title,data) VALUES($1,'aurboda',$2,'work_entry',$3,$4,$5)",
      [id, externalId, time, `${profile.name} · ${body.work_date}`, data],
    )
  }
  return {
    activity_id: id,
    profile_id: profile.id,
    work_date: body.work_date,
    timestamp: time.toISOString(),
    metric_count: Object.keys(totals).length,
  }
}
