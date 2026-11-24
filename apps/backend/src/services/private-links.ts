import {
  privateLinkTargetsQuerySchema,
  personTimeWithQuerySchema,
  setActivityPeopleBodySchema,
  type PersonTimeWithQuery,
  type PersonTimeWithResponse,
  type PrivateLinkTarget,
  type SetActivityPeopleBody,
  getMetricAggregation,
} from '@aurboda/api-spec'
import { z } from 'zod'

import type { Queryable } from '../db/pool.ts'

import { query, withUserTransaction } from '../db/connection.ts'
import { getCustomMetricDefinitions } from '../db/custom-metrics.ts'
import { getDailyAggregates } from '../db/time-series.ts'
import { httpError } from '../http-error.ts'
import { pearson } from './correlations/stats.ts'

const id = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw httpError(400, 'Invalid record identifier.')
  return value
}
const personName = "COALESCE(NULLIF(p.profile->>'preferred_name',''), p.profile->>'name')"
export const privateLinkTargets = async (user: string, search = ''): Promise<PrivateLinkTarget[]> => {
  const body = privateLinkTargetsQuerySchema.safeParse({ search })
  if (!body.success) throw httpError(400, 'Invalid search.')
  const pattern = `%${body.data.search.replaceAll(/[\\%_]/g, '\\$&')}%`
  const result = await query<PrivateLinkTarget>(
    user,
    `
    (SELECT p.id, 'person' AS kind, ${personName} AS name FROM people p WHERE ${personName} ILIKE $1 ESCAPE '\\' ORDER BY name, p.id LIMIT 100)
    UNION ALL
    (SELECT a.id, 'activity' AS kind, COALESCE(NULLIF(a.title,''),a.activity_type) AS name FROM activities a
      WHERE a.deleted_at IS NULL AND a.superseded_by IS NULL AND concat_ws(' ',a.title,a.activity_type) ILIKE $1 ESCAPE '\\'
      ORDER BY a.start_time DESC,a.id LIMIT 100)`,
    [pattern],
  )
  return result.rows
}
const requireActivity = async (tx: Queryable | string, activityId: string, lock = false) => {
  const row = await query(
    tx,
    `SELECT id FROM activities WHERE id=$1 AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
    [id(activityId)],
  )
  if (!row.rowCount) throw httpError(404, 'Activity not found.')
}
export const getActivityPeople = async (
  user: string | Queryable,
  activityId: string,
  additionalIds: string[] = [],
): Promise<PrivateLinkTarget[]> => {
  await requireActivity(user, activityId)
  const activityIds = [...new Set([activityId, ...additionalIds].map(id))]
  if (activityIds.length > 100) throw httpError(400, 'Choose at most 100 source activities.')
  return (
    await query<PrivateLinkTarget>(
      user,
      `SELECT DISTINCT p.id, 'person' AS kind, ${personName} AS name FROM people p
    JOIN activity_people ap ON ap.person_id=p.id WHERE ap.activity_id=ANY($1::uuid[]) ORDER BY name,p.id`,
      [activityIds],
    )
  ).rows
}
export const setActivityPeople = async (user: string, activityId: string, value: SetActivityPeopleBody) => {
  const parsed = setActivityPeopleBodySchema.safeParse(value)
  if (!parsed.success) throw httpError(400, 'Choose valid people.')
  const ids = [...new Set(parsed.data.person_ids.map((v) => v.toLowerCase()))]
  return withUserTransaction(user, async (tx) => {
    await requireActivity(tx, activityId)
    const activityIds = [...new Set([activityId, ...(parsed.data.activity_ids ?? [])].map(id))].sort()
    const activities = await tx.query(
      'SELECT id FROM activities WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',
      [activityIds],
    )
    if (activities.rowCount !== activityIds.length) {
      throw httpError(400, 'Choose source activities from your own account.')
    }
    const found = await tx.query('SELECT id FROM people WHERE id=ANY($1::uuid[]) FOR KEY SHARE', [ids])
    if (found.rowCount !== ids.length) throw httpError(400, 'Choose people from your own account.')
    await tx.query('DELETE FROM activity_people WHERE activity_id=ANY($1::uuid[])', [activityIds])
    await tx.query(
      'INSERT INTO activity_people(activity_id,person_id) SELECT a.id,p.id FROM unnest($1::uuid[]) a(id) CROSS JOIN unnest($2::uuid[]) p(id)',
      [activityIds, ids],
    )
    return getActivityPeople(tx, activityId, activityIds)
  })
}
export const validateJournalLinks = async (
  tx: Queryable,
  links: { kind: string; record_id: string }[],
  previous: { kind: string; record_id: string }[] = [],
) => {
  for (const link of links) {
    if (link.kind !== 'person' && link.kind !== 'activity') continue
    if (previous.some((old) => old.kind === link.kind && old.record_id === link.record_id)) continue
    id(link.record_id)
    const found = await tx.query(
      link.kind === 'person'
        ? 'SELECT id FROM people WHERE id=$1 FOR KEY SHARE'
        : 'SELECT id FROM activities WHERE id=$1 AND deleted_at IS NULL FOR KEY SHARE',
      [link.record_id],
    )
    if (!found.rowCount) throw httpError(400, 'Choose a related record from your own account.')
  }
}
export const unionMinutes = (spans: [number, number][]): number => {
  let end = -Infinity,
    total = 0
  for (const [start, stop] of spans.toSorted((a, b) => a[0] - b[0])) {
    if (stop > Math.max(start, end)) total += stop - Math.max(start, end)
    end = Math.max(end, stop)
  }
  return total / 60000
}
export const privateTimeCorrelation = (pairs: [number, number][]): number | null =>
  pearson(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  )
export const personTimeWith = async (
  user: string,
  personId: string,
  value: PersonTimeWithQuery,
): Promise<PersonTimeWithResponse['data']> => {
  id(personId)
  const parsed = personTimeWithQuerySchema.safeParse(value)
  if (!parsed.success) throw httpError(400, 'Choose a valid date range.')
  const q = parsed.data
  let start: Temporal.ZonedDateTime, stop: Temporal.ZonedDateTime
  try {
    start = Temporal.PlainDate.from(q.from).toZonedDateTime(q.timezone)
    stop = Temporal.PlainDate.from(q.to).add({ days: 1 }).toZonedDateTime(q.timezone)
  } catch {
    throw httpError(400, 'Choose a valid time zone.')
  }
  const count = Temporal.PlainDate.from(q.from).until(Temporal.PlainDate.from(q.to)).days + 1
  if (count < 1 || count > 366) throw httpError(400, 'Choose between 1 and 366 days.')
  return withUserTransaction(user, async (tx) => {
    if (!(await tx.query('SELECT id FROM people WHERE id=$1', [personId])).rowCount) {
      throw httpError(404, 'Person not found.')
    }
    const rows = await tx.query<{ id: string; title: string; start_time: Date; end_time: Date | null }>(
      `SELECT a.id,COALESCE(NULLIF(a.title,''),a.activity_type) AS title,a.start_time,a.end_time FROM activities a JOIN activity_people ap ON ap.activity_id=a.id WHERE ap.person_id=$1 AND a.deleted_at IS NULL AND a.superseded_by IS NULL AND a.start_time<$3 AND COALESCE(a.end_time,a.start_time)>=$2 ORDER BY a.start_time,a.id`,
      [personId, new Date(Number(start.epochMilliseconds)), new Date(Number(stop.epochMilliseconds))],
    )
    const privateEvents = (
      await tx.query<{ start_time: Date; end_time: Date }>(
        "SELECT (event->>'timestamp')::timestamptz AS start_time,(event->>'end_time')::timestamptz AS end_time FROM people_events WHERE person_id=$1 AND event->>'type' IN ('shared_activity','care') AND event->>'end_time' IS NOT NULL AND (event->>'timestamp')::timestamptz<$3 AND (event->>'end_time')::timestamptz>=$2",
        [personId, new Date(Number(start.epochMilliseconds)), new Date(Number(stop.epochMilliseconds))],
      )
    ).rows
    const aggregation = q.metric ? getMetricAggregation(q.metric, await getCustomMetricDefinitions(tx)) : null
    const metrics = q.metric
      ? (
          await getDailyAggregates(
            tx,
            [q.metric],
            new Date(Number(start.epochMilliseconds)),
            new Date(Number(stop.epochMilliseconds) - 1),
            q.timezone,
          )
        ).map((row) => ({ date: row.date, value: row[aggregation!] }))
      : []
    const days = Array.from({ length: count }, (_, offset) => {
      const date = Temporal.PlainDate.from(q.from).add({ days: offset }),
        lower = Number(date.toZonedDateTime(q.timezone).epochMilliseconds),
        upper = Number(date.add({ days: 1 }).toZonedDateTime(q.timezone).epochMilliseconds)
      return {
        date: date.toString(),
        minutes: unionMinutes(
          [...rows.rows, ...privateEvents]
            .map((a): [number, number] => [
              Math.max(lower, a.start_time.getTime()),
              Math.min(upper, a.end_time?.getTime() ?? a.start_time.getTime()),
            ])
            .filter(([a, b]) => b > a),
        ),
        metric_value: metrics.find((m) => m.date === date.toString())?.value ?? null,
      }
    })
    const pairs = days
      .filter((d) => d.metric_value !== null)
      .map((d): [number, number] => [d.minutes, d.metric_value!])
    return {
      person_id: personId,
      metric_aggregation: aggregation,
      days,
      activities: rows.rows.map((a) => ({
        ...a,
        start_time: a.start_time.toISOString(),
        end_time: a.end_time?.toISOString() ?? null,
      })),
      total_minutes: days.reduce((n, d) => n + d.minutes, 0),
      correlation: privateTimeCorrelation(pairs),
      paired_days: pairs.length,
    }
  })
}
