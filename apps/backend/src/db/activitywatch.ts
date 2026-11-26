import type { ActivityWatchDevice, ActivityWatchEvent } from '@aurboda/api-spec'

import { createHash } from 'node:crypto'
import format from 'pg-format'

import type { ProductivityRecord } from './types.ts'

import { query, withUserTransaction } from './connection.ts'
import { insertProductivity, toPgArray } from './productivity.ts'

export const storeActivityWatch = async (
  user: string,
  events: ActivityWatchEvent[],
  records: ProductivityRecord[],
  device: string,
  mobile: boolean,
) =>
  withUserTransaction(user, async (tx) => {
    // Serializes observation/projection reconciliation even across server processes.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('activitywatch_projection'))")
    const unique = new Map(
      events.map((event, index) => {
        const id =
          event.source_event_id ??
          createHash('sha256')
            .update(JSON.stringify([new Date(event.timestamp).toISOString(), event.app]))
            .digest('hex')
        return [
          JSON.stringify([event.bucket_id ?? '', event.source_instance ?? '', id]),
          { event, id, record: records[index]! },
        ]
      }),
    )
    const identities = [...unique.values()].map(({ event, id }) => ({
      bucket_id: event.bucket_id ?? '',
      source_instance: event.source_instance ?? '',
      event_id: id,
    }))
    const old = await tx.query(
      `SELECT date_trunc('milliseconds', start_time) AS start_time, app
      FROM activitywatch_observations o JOIN jsonb_to_recordset($2::jsonb) AS i(bucket_id text,source_instance text,event_id text)
      USING(bucket_id,source_instance,event_id) WHERE device_name=$1`,
      [device, JSON.stringify(identities)],
    )
    const keys = [
      ...old.rows.map((row) => ({ start_time: new Date(row.start_time).toISOString(), app: row.app })),
      ...events.map((event) => ({ start_time: new Date(event.timestamp).toISOString(), app: event.app })),
    ]
    const values = [...unique.values()].map(({ event, id, record }) => [
      device,
      event.bucket_id ?? '',
      id,
      event.source_instance ?? '',
      event.is_afk ?? false,
      event.timestamp,
      event.timestamp,
      event.duration,
      event.app,
      JSON.stringify(
        event.source_data ?? {
          ...(event.category === undefined ? {} : { category: event.category }),
          ...(event.title === undefined ? {} : { title: event.title }),
        },
      ),
      event.category ?? null,
      toPgArray(record.resolved_category),
      mobile,
    ])
    await tx.query(
      format(
        `INSERT INTO activitywatch_observations
      (device_name,bucket_id,event_id,source_instance,is_afk,original_timestamp,start_time,duration_sec,app,source_data,category,resolved_category,is_mobile) VALUES %L
      ON CONFLICT (device_name,bucket_id,source_instance,event_id) DO UPDATE SET
      original_timestamp=EXCLUDED.original_timestamp,start_time=EXCLUDED.start_time,duration_sec=EXCLUDED.duration_sec,
      app=EXCLUDED.app,is_afk=EXCLUDED.is_afk,source_data=EXCLUDED.source_data,category=EXCLUDED.category,resolved_category=EXCLUDED.resolved_category,
      is_mobile=EXCLUDED.is_mobile,updated_at=NOW()`,
        values,
      ),
    )
    // The legacy view has one row per app/start/device. Collisions choose the longest
    // observation deterministically; every granular observation remains in the raw table.
    const projected = await tx.query(
      `SELECT DISTINCT ON (date_trunc('milliseconds',o.start_time),o.app)
      date_trunc('milliseconds',o.start_time) AS projection_start, o.*
      FROM activitywatch_observations o WHERE device_name=$1 AND NOT is_afk AND EXISTS
      (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS k(start_time timestamptz,app text)
       WHERE date_trunc('milliseconds',o.start_time)=k.start_time AND o.app=k.app)
      ORDER BY date_trunc('milliseconds',o.start_time),o.app,o.duration_sec DESC,o.bucket_id,o.source_instance,o.event_id`,
      [device, JSON.stringify(keys)],
    )
    await tx.query(
      `UPDATE productivity p SET deleted_at=NOW(),aw_source_retracted=TRUE
      WHERE p.source='activitywatch' AND p.device_name=$1 AND p.aw_managed AND p.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS k(start_time timestamptz,app text) WHERE p.start_time=k.start_time AND p.activity=k.app)
      AND NOT EXISTS (SELECT 1 FROM activitywatch_observations o WHERE o.device_name=p.device_name AND NOT o.is_afk
        AND date_trunc('milliseconds',o.start_time)=p.start_time AND o.app=p.activity)`,
      [device, JSON.stringify(keys)],
    )
    const projections: ProductivityRecord[] = projected.rows.map((row) => ({
      source: 'activitywatch',
      device_name: device,
      start_time: new Date(row.projection_start),
      end_time: new Date(new Date(row.start_time).getTime() + row.duration_sec * 1000),
      duration_sec: Math.round(row.duration_sec),
      activity: row.app,
      title: row.source_data.title,
      category: row.category ?? undefined,
      resolved_category: row.resolved_category ?? undefined,
      is_mobile: row.is_mobile,
    }))
    await tx.query(
      `UPDATE productivity p SET deleted_at=NULL,aw_source_retracted=FALSE
      WHERE source='activitywatch' AND device_name=$1 AND aw_source_retracted
      AND EXISTS (SELECT 1 FROM activitywatch_observations o WHERE o.device_name=p.device_name AND NOT o.is_afk
        AND date_trunc('milliseconds',o.start_time)=p.start_time AND o.app=p.activity)`,
      [device],
    )
    await insertProductivity(user, projections, tx)
    await tx.query(
      `UPDATE productivity p SET aw_managed=TRUE WHERE source='activitywatch' AND device_name=$1
      AND EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS k(start_time timestamptz,app text) WHERE p.start_time=k.start_time AND p.activity=k.app)`,
      [device, JSON.stringify(keys)],
    )
    const result = await tx.query(
      `SELECT COUNT(*)::int AS events_total, MIN(start_time) AS earliest_event,
      MAX(start_time) AS latest_event FROM activitywatch_observations WHERE device_name=$1`,
      [device],
    )
    const row = result.rows[0]!
    return {
      events_total: row.events_total as number,
      earliest_event: new Date(row.earliest_event).toISOString(),
      latest_event: new Date(row.latest_event).toISOString(),
    }
  })

export const getActivityWatchDevices = async (user: string): Promise<ActivityWatchDevice[]> => {
  const result = await query(
    user,
    `SELECT device_name,is_mobile,COUNT(*)::int AS events_total,
    MIN(start_time) AS earliest_event,MAX(start_time) AS latest_event,MAX(updated_at) AS last_received
    FROM activitywatch_observations GROUP BY device_name,is_mobile
    UNION ALL
    SELECT p.device_name,COALESCE(p.is_mobile,FALSE),COUNT(*)::int,MIN(p.start_time),MAX(p.start_time),NULL
    FROM productivity p WHERE p.source='activitywatch' AND p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM activitywatch_observations o WHERE o.device_name=p.device_name AND o.is_mobile=COALESCE(p.is_mobile,FALSE))
    GROUP BY p.device_name,p.is_mobile ORDER BY device_name`,
  )
  return result.rows.map((row) => ({
    device_name: row.device_name,
    is_mobile: row.is_mobile,
    events_total: row.events_total,
    earliest_event: new Date(row.earliest_event).toISOString(),
    latest_event: new Date(row.latest_event).toISOString(),
    ...(row.last_received ? { last_received: new Date(row.last_received).toISOString() } : {}),
  }))
}
