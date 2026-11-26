import format from 'pg-format'

import type { Queryable } from './pool.ts'
import type { ProductivityRecord } from './types.ts'

import { allocateProductivity } from '../services/productivity-union.ts'
import { query } from './connection.ts'

/**
 * Convert a JS string array to a PostgreSQL array literal.
 *
 * pg-format's %L treats JS arrays as sub-tuples for multi-row VALUES,
 * so we must serialize TEXT[] columns ourselves before formatting.
 *
 * Examples:
 *   ['TV']                       → '{TV}'
 *   ['Work', 'Programming']      → '{Work,Programming}'
 *   ['has "quotes"', 'a,comma']  → '{"has \\"quotes\\"","a,comma"}'
 *   null / undefined              → null
 */
export const toPgArray = (arr: string[] | null | undefined): string | null => {
  if (arr == null) return null

  const escaped = arr.map((s) => {
    // Quote the element if it contains special chars, is empty, or looks like a keyword
    if (s === '' || /[{},"\\\s]/.test(s) || s.toUpperCase() === 'NULL') {
      return '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'
    }
    return s
  })

  return '{' + escaped.join(',') + '}'
}

export const insertProductivity = async (user: string, records: ProductivityRecord[], tx?: Queryable) => {
  if (records.length === 0) return

  const values = records.map((r) => [
    r.source || 'rescuetime',
    r.start_time,
    r.end_time,
    r.activity,
    r.title || null,
    r.category,
    r.productivity,
    r.duration_sec,
    r.is_mobile || false,
    r.device_name ?? '',
    toPgArray(r.resolved_category) ?? null,
  ])

  const sql = format(
    `INSERT INTO productivity (source, start_time, end_time, activity, title, category, productivity, duration_sec, is_mobile, device_name, resolved_category)
       VALUES %L
       ON CONFLICT (source, start_time, activity, device_name) DO UPDATE SET
         end_time = EXCLUDED.end_time,
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         productivity = EXCLUDED.productivity,
         duration_sec = EXCLUDED.duration_sec,
         is_mobile = EXCLUDED.is_mobile,
         resolved_category = EXCLUDED.resolved_category
       WHERE productivity.deleted_at IS NULL`,
    values,
  )
  if (tx) await tx.query(sql)
  else await query(user, sql)
}

export const getProductivity = async (
  user: string,
  start: Date,
  end: Date,
): Promise<ProductivityRecord[]> => {
  const result = await query(
    user,
    `SELECT id, source, start_time, end_time, activity, title, category, productivity, duration_sec, is_mobile, device_name, resolved_category
     FROM productivity
     WHERE end_time > $1 AND start_time <= $2
       AND deleted_at IS NULL
     ORDER BY start_time`,
    [start, end],
  )

  return result.rows.map((row) => ({
    activity: row.activity,
    category: row.category,
    device_name: row.device_name || undefined,
    duration_sec: row.duration_sec,
    end_time: new Date(row.end_time),
    id: row.id,
    is_mobile: row.is_mobile,
    productivity: row.productivity,
    resolved_category: row.resolved_category || undefined,
    source: row.source,
    start_time: new Date(row.start_time),
    title: row.title || undefined,
  }))
}

export const getProductivityById = async (user: string, id: string): Promise<ProductivityRecord | null> => {
  const result = await query(
    user,
    `SELECT id, source, start_time, end_time, activity, title, category, productivity, duration_sec, is_mobile, device_name, resolved_category
     FROM productivity
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  )

  if (result.rows.length === 0) return null
  const row = result.rows[0]
  return {
    activity: row.activity,
    category: row.category,
    device_name: row.device_name || undefined,
    duration_sec: row.duration_sec,
    end_time: new Date(row.end_time),
    id: row.id,
    is_mobile: row.is_mobile,
    productivity: row.productivity,
    resolved_category: row.resolved_category || undefined,
    source: row.source,
    start_time: new Date(row.start_time),
    title: row.title || undefined,
  }
}

export const deleteProductivityRecord = async (user: string, id: string): Promise<boolean> => {
  const result = await query(
    user,
    `UPDATE productivity SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  )

  return (result.rowCount ?? 0) > 0
}

export const restoreProductivityRecord = async (user: string, id: string): Promise<boolean> => {
  const result = await query(
    user,
    `UPDATE productivity SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id],
  )

  return (result.rowCount ?? 0) > 0
}

/** Used after category rules change to recategorize all records. */
export const batchUpdateResolvedCategory = async (
  user: string,
  updates: Array<{ id: string; resolved_category: string[] | null }>,
) => {
  if (updates.length === 0) return

  // Convert JS arrays to PostgreSQL array literals; pg-format %L treats
  // JS arrays as sub-tuples, which produces invalid TEXT[] values.
  const values = updates.map((u) => [u.id, toPgArray(u.resolved_category)])

  await query(
    user,
    format(
      `UPDATE productivity AS p
       SET resolved_category = v.resolved_category::TEXT[]
       FROM (VALUES %L) AS v(id, resolved_category)
       WHERE p.id = v.id::UUID`,
      values,
    ),
  )
}

/**
 * Get distinct app/title combinations with their resolved categories and usage stats.
 *
 * Groups by (activity, title, resolved_category) so that e.g. "firefox" opened to
 * a Netflix page appears separately from "firefox" opened to GitHub — making it
 * clear why a browser app shows up under a particular category.
 *
 * Useful for category management UI: shows what's matched and what isn't, with
 * enough context to understand why.
 */
export const getDistinctApps = async (
  user: string,
): Promise<
  Array<{
    activity: string
    title?: string
    resolved_category?: string[]
    total_duration_sec: number
    record_count: number
    last_seen: Date
  }>
> => {
  const records = await getProductivity(
    user,
    new Date('0001-01-01T00:00:00Z'),
    new Date('9999-12-31T23:59:59Z'),
  )
  const key = (r: ProductivityRecord) => JSON.stringify([r.activity, r.title, r.resolved_category])
  const groups = new Map<
    string,
    {
      activity: string
      title?: string
      resolved_category?: string[]
      total_duration_sec: number
      record_count: number
      last_seen: Date
    }
  >()
  for (const record of records) {
    const id = key(record)
    const group = groups.get(id) ?? {
      activity: record.activity,
      title: record.title,
      resolved_category: record.resolved_category,
      total_duration_sec: 0,
      record_count: 0,
      last_seen: record.start_time,
    }
    group.record_count++
    if (record.start_time > group.last_seen) group.last_seen = record.start_time
    groups.set(id, group)
  }
  for (const record of allocateProductivity(records)) {
    groups.get(key(record))!.total_duration_sec += record.duration_sec
  }
  return [...groups.values()].sort((a, b) => b.last_seen.getTime() - a.last_seen.getTime())
}

export interface ProductivityBucketRow {
  bucket_start: Date
  bucket_end?: Date
  resolved_category: string[] | null
  total_sec: number
  record_count: number
}

/**
 * Used for the horizontal timeline stacked bar chart.
 *
 * Subday boundaries are absolute instants; calendar-day steps use the requested timezone.
 */
export const getProductivityBucketed = async (
  user: string,
  start: Date,
  end: Date,
  interval: string,
  tz: string = 'UTC',
): Promise<ProductivityBucketRow[]> => {
  const result = await query(
    user,
    `WITH clipped AS (
       SELECT p.*, GREATEST(start_time,$1) AS lo, LEAST(end_time,$2) AS hi
       FROM productivity p WHERE end_time > $1 AND start_time < $2 AND deleted_at IS NULL
     ), slices AS (
       SELECT c.*, b.bucket_start, b.bucket_end,
         tstzrange(GREATEST(lo,b.bucket_start),LEAST(hi,b.bucket_end),'[)') AS span
       FROM clipped c CROSS JOIN LATERAL (
         SELECT boundary AS bucket_start, lead(boundary) OVER (ORDER BY boundary) AS bucket_end
         FROM generate_series(
           CASE WHEN $3::interval < interval '1 day' THEN date_bin($3::interval,lo,$1::timestamptz)
             ELSE date_bin($3::interval,lo AT TIME ZONE $4,($1 AT TIME ZONE $4)::timestamp) AT TIME ZONE $4 END,
           hi + 2 * $3::interval,$3::interval,$4) boundary
       ) b WHERE b.bucket_start < hi AND b.bucket_end > lo
     ), categories AS (
       SELECT bucket_start,bucket_end,resolved_category,range_agg(span) AS coverage,COUNT(DISTINCT id)::int AS record_count
       FROM slices GROUP BY bucket_start,bucket_end,resolved_category
     ), allocated AS (
       SELECT *, coverage - COALESCE(range_agg(coverage) OVER (
         PARTITION BY bucket_start ORDER BY resolved_category NULLS LAST
         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),'{}'::tstzmultirange) AS exclusive
       FROM categories
     )
     SELECT bucket_start,bucket_end,resolved_category,record_count,
       COALESCE((SELECT SUM(EXTRACT(EPOCH FROM upper(r)-lower(r))) FROM unnest(exclusive) r),0)::double precision AS total_sec
     FROM allocated ORDER BY bucket_start`,
    [start, end, interval, tz],
  )

  return result.rows.map((row) => ({
    bucket_start: new Date(row.bucket_start as string),
    bucket_end: new Date(row.bucket_end as string),
    record_count: row.record_count as number,
    resolved_category: row.resolved_category || null,
    total_sec: row.total_sec as number,
  }))
}

/** Returns only id, activity, and title to minimize memory usage. */
export const getAllProductivityForCategorization = async (
  user: string,
): Promise<Array<{ id: string; activity: string; title?: string; resolved_category: string[] | null }>> => {
  const result = await query(
    user,
    `SELECT id, activity, title, resolved_category FROM productivity WHERE deleted_at IS NULL`,
  )

  return result.rows.map((row) => ({
    activity: row.activity,
    id: row.id,
    resolved_category: row.resolved_category ?? null,
    title: row.title || undefined,
  }))
}
