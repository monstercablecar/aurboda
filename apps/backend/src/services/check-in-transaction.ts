import type { DataSchemaDefinition } from '@aurboda/api-spec'

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Queryable } from '../db/pool.ts'
import type { CheckInDeps, ActivitySpan } from './check-ins.ts'

import * as db from '../db/check-ins.ts'
import { withUserTransaction } from '../db/connection.ts'
import { getCustomMetricDefinitions } from '../db/custom-metrics.ts'
import * as notifications from '../db/notifications.ts'
import { getSourceFilter } from '../db/time-series.ts'
import { httpError } from '../http-error.ts'
import { getCatalogActivityType, loadActivityTypeCatalog } from './activity-type-catalog.ts'
import { validateActivityData } from './data-schema-validation.ts'
import { resolveMetricForWrite, valueForWrite } from './metric-resolution.ts'
import { createNotifier } from './notifications.ts'

export const scopedCheckInDeps = (base: CheckInDeps, tx: Queryable): CheckInDeps => {
  let owner: string = randomUUID()
  const notifier = createNotifier({
    getPreference: (_user, type) => notifications.getNotificationPreference(tx, type),
    insert: (_user, input) => notifications.insertNotification(tx, input),
    prune: (_user, read, any) => notifications.pruneNotifications(tx, read, any),
    revise: (_user, target, patch) => notifications.reviseNotification(tx, target, patch),
    reviseOpen: (_user, keys, patch) => notifications.reviseOpenNotifications(tx, keys, patch),
  })
  const activityTypeSchema: CheckInDeps['activityTypeSchema'] = async (_user, type) => {
    const result = await tx.query<{ data_schema: DataSchemaDefinition | null }>(
      'SELECT data_schema FROM activity_type_definitions WHERE name=$1',
      [type],
    )
    if (result.rows[0]) return { schema: result.rows[0].data_schema ?? undefined }
    const entry = getCatalogActivityType(loadActivityTypeCatalog(), type)
    return entry ? { schema: entry.data_schema } : undefined
  }
  const scoped: CheckInDeps = {
    ...base,
    setResponseOwner: (id) => {
      owner = id
    },
    retryRequest: async (body) => {
      if (!body.request_id) return null
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `check-in-request:${body.request_id}`,
      ])
      const result = await tx.query<{ request: unknown; response_id: string }>(
        'SELECT request,response_id FROM check_in_requests WHERE id=$1',
        [body.request_id],
      )
      const previous = result.rows[0]
      if (!previous) return null
      if (!isDeepStrictEqual(previous.request, JSON.parse(JSON.stringify(body)))) {
        throw httpError(409, 'This retry key already belongs to different check-in content.')
      }
      return db.getCheckIn(tx, previous.response_id)
    },
    rememberRequest: async (body, responseId) => {
      if (body.request_id) {
        await tx.query('INSERT INTO check_in_requests(id,request,response_id) VALUES($1,$2,$3)', [
          body.request_id,
          body,
          responseId,
        ])
      }
    },
    getForm: (_user, id) => db.getCheckInForm(tx, id),
    listForms: (_user, options) => db.listCheckInForms(tx, options),
    insertForm: (_user, input) => db.insertCheckInForm(tx, input),
    updateForm: (_user, id, patch, options) => db.updateCheckInForm(tx, id, patch, options),
    softDeleteForm: (_user, id) => db.softDeleteCheckInForm(tx, id),
    restoreForm: (_user, id, at) => db.restoreCheckInForm(tx, id, at),
    listVersions: (_user, id) => db.listCheckInFormVersions(tx, id),
    getCheckIn: (_user, id) => db.getCheckIn(tx, id),
    insertCheckIn: async (_user, input) => db.insertCheckIn(tx, { ...input, id: owner }),
    listCheckIns: (_user, options) => db.listCheckIns(tx, options),
    updateCheckIn: (_user, id, patch) => db.updateCheckIn(tx, id, patch),
    setCheckInDeleted: (_user, id, deleted) => db.setCheckInDeleted(tx, id, deleted),
    listFormCheckInsBetween: (_user, id, from, to) => db.listFormCheckInsBetween(tx, id, from, to),
    deleteSkips: (_user, id, at) => db.deleteSkippedCheckIns(tx, id, at),
    getCustomMetrics: () => getCustomMetricDefinitions(tx),
    createMetric: async (_user, definition) => {
      await tx.query(
        'INSERT INTO custom_metrics(name,unit,description) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',
        [definition.name, definition.unit, definition.description ?? null],
      )
      const stored = (
        await tx.query<{ unit: string }>('SELECT unit FROM custom_metrics WHERE name=$1', [definition.name])
      ).rows[0]!
      if (stored.unit !== definition.unit) {
        throw httpError(
          409,
          'Another form created this metric with a different unit. Choose a different metric name.',
        )
      }
    },
    getTimezone: async () => {
      const result = await tx.query<{ timezone: string | null }>(
        "SELECT settings->>'device_timezone' AS timezone FROM user_settings LIMIT 1",
      )
      const zone = result.rows[0]?.timezone
      try {
        if (zone) {
          Temporal.Now.zonedDateTimeISO(zone)
          return zone
        }
      } catch {}
      return 'UTC'
    },
    markDueRead: (_user, id, slots) => notifications.markCheckInDueNotificationsRead(tx, id, slots),
    raise: async (user, input) => {
      await notifier.raise(user, input)
    },
    forgetPoints: async () => undefined,
    activityMutated: undefined,
    overridesOf: async () => [],
    activityTypeSchema,
    activityIsLive: async (_user, id) =>
      (await tx.query('SELECT id FROM activities WHERE id=$1 AND deleted_at IS NULL', [id])).rowCount !== 0,
    writePoints: async (_user, items) => {
      const custom = await getCustomMetricDefinitions(tx)
      for (const item of items) {
        const resolved = resolveMetricForWrite(item.metric, custom, base.catalog())
        if (!resolved) throw httpError(400, 'Choose a known output metric.')
        const converted = valueForWrite(resolved, item.value, item.unit)
        if ('error' in converted) throw httpError(400, converted.error)
        const filter = getSourceFilter(resolved.metric)
        if (filter && !filter.includes('manual')) {
          throw httpError(400, 'This metric cannot receive check-in outputs.')
        }
        const definition = custom.find((m) => m.name === resolved.metric)
        if (
          (definition?.min_value !== undefined && converted.value < definition.min_value) ||
          (definition?.max_value !== undefined && converted.value > definition.max_value)
        ) {
          throw httpError(400, 'Output value is outside the metric range.')
        }
        const point = await tx.query<{ updated_at: Date }>(
          `INSERT INTO time_series(metric,time,source,value,unit) VALUES($1,$2,'manual',$3,$4) ON CONFLICT DO NOTHING RETURNING updated_at`,
          [resolved.metric, item.time, converted.value, resolved.unit],
        )
        if (!point.rowCount) {
          throw httpError(
            409,
            'Another check-in or an independently edited metric occupies this metric and time. Choose another time or metric.',
          )
        }
        await tx.query(
          "INSERT INTO check_in_metric_outputs(owner_id,metric,time,value,written_at) SELECT $1,metric,time,value,updated_at FROM time_series WHERE metric=$2 AND time=$3 AND source='manual'",
          [owner, resolved.metric, item.time],
        )
      }
      return { success: true, inserted: items.length, errors: [] }
    },
    deletePoints: async (_user, points) => {
      for (const point of points) {
        await tx.query(
          `DELETE FROM time_series t USING check_in_metric_outputs o WHERE o.owner_id=$1 AND o.metric=$2 AND o.time=$3 AND t.metric=o.metric AND t.time=o.time AND t.source='manual' AND t.value=o.value AND t.updated_at IS NOT DISTINCT FROM o.written_at`,
          [owner, point.metric, point.time],
        )
        await tx.query('DELETE FROM check_in_metric_outputs WHERE owner_id=$1 AND metric=$2 AND time=$3', [
          owner,
          point.metric,
          point.time,
        ])
      }
    },
    addActivity: async (user, input) => {
      const target = await activityTypeSchema(user, input.activity_type)
      if (!target) throw httpError(400, 'Choose a known activity type for this output.')
      const validation = target.schema ? validateActivityData(input.data, target.schema) : { valid: true }
      if (!validation.valid) throw httpError(400, 'The activity output does not match its configured fields.')
      await tx.query(
        'INSERT INTO activity_type_definitions(name,display_name,data_schema) VALUES($1,$1,$2) ON CONFLICT DO NOTHING',
        [input.activity_type, target.schema ?? null],
      )
      const result = await tx.query<{ id: string; updated_at: Date }>(
        `INSERT INTO activities(source,external_id,activity_type,start_time,data) VALUES('manual',$1,$2,$3,$4) RETURNING id,updated_at`,
        [input.external_id, input.activity_type, input.start_time, input.data],
      )
      const record = result.rows[0]!
      await tx.query(
        'INSERT INTO check_in_activity_outputs(owner_id,activity_id,written_at) SELECT $1,id,updated_at FROM activities WHERE id=$2',
        [owner, record.id],
      )
      return { success: true, id: record.id }
    },
    deleteActivity: async (_user, id) => {
      const result = await tx.query<ActivitySpan>(
        `UPDATE activities a SET deleted_at=NOW() FROM check_in_activity_outputs o WHERE a.id=$1 AND o.activity_id=a.id AND o.owner_id=$2 AND a.source='manual' AND a.deleted_at IS NULL AND a.updated_at IS NOT DISTINCT FROM o.written_at RETURNING a.activity_type,a.start_time,a.end_time`,
        [id, owner],
      )
      return result.rows[0] ?? null
    },
    restoreActivity: async (_user, id) => {
      const result = await tx.query<ActivitySpan>(
        `UPDATE activities a SET deleted_at=NULL FROM check_in_activity_outputs o WHERE a.id=$1 AND o.activity_id=a.id AND o.owner_id=$2 AND a.source='manual' AND a.deleted_at IS NOT NULL AND a.updated_at IS NOT DISTINCT FROM o.written_at RETURNING a.activity_type,a.start_time,a.end_time`,
        [id, owner],
      )
      return result.rows[0] ?? null
    },
  }
  return scoped
}

export const withCheckInTransaction = async <T>(
  base: CheckInDeps,
  user: string,
  formId: string,
  fn: (scoped?: CheckInDeps) => Promise<T>,
): Promise<T> => {
  const rollback = Symbol('check-in-refusal')
  let refused: T
  try {
    return await withUserTransaction(user, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`check_in_form:${formId}`])
      const result = await fn(scopedCheckInDeps(base, tx))
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        refused = result
        throw rollback
      }
      return result
    })
  } catch (error) {
    if (error === rollback) return refused!
    throw error
  }
}
