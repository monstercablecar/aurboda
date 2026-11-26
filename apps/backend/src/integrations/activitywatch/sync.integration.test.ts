import type { RequestHandler } from 'express'

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import type { SyncRouterDeps } from '../../sync-router.ts'

import { query } from '../../db/connection.ts'
import { getProductivity } from '../../db/productivity.ts'
import { cleanTestDb, getTestUser, startTestDb, stopTestDb } from '../../test/db-test-helper.ts'
import { processActivityWatchEvents } from './sync.ts'

beforeAll(startTestDb, 120000)
afterAll(stopTestDb, 120000)
beforeEach(async () => {
  await cleanTestDb()
  await query(getTestUser(), 'DELETE FROM activitywatch_observations')
}, 120000)
const event = (id: string, overrides = {}) => ({
  app: 'Synthetic app',
  timestamp: '2025-01-01T12:00:00.123456+00:00',
  duration: 60.125,
  bucket_id: 'aw-watcher-android',
  source_event_id: id,
  source_data: { app: 'Synthetic app', package: 'test.example', categories: ['Work'] },
  ...overrides,
})

test('history is persisted with raw precision, provenance and an idempotent dashboard projection', async () => {
  const user = getTestUser()
  for (let i = 0; i < 2; i++) {
    expect(await processActivityWatchEvents(user, [event('1')], 'pixel_9_pro', true)).toMatchObject({
      status: 'success',
      events_total: 1,
    })
  }
  const raw = await query(user, 'SELECT * FROM activitywatch_observations')
  expect(raw.rows).toHaveLength(1)
  expect(raw.rows[0]).toMatchObject({
    original_timestamp: '2025-01-01T12:00:00.123456+00:00',
    duration_sec: 60.125,
    device_name: 'pixel_9_pro',
    source_data: { package: 'test.example', categories: ['Work'] },
  })
  const view = await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02'))
  expect(view).toHaveLength(1)
  expect(view[0]).toMatchObject({
    activity: 'Synthetic app',
    source: 'activitywatch',
    is_mobile: true,
    device_name: 'pixel_9_pro',
  })
})

test('multiple buckets and devices retain distinct observations and deterministic collisions', async () => {
  const user = getTestUser()
  const events = [event('1'), event('2', { duration: 120.5 }), event('1', { bucket_id: 'another' })]
  expect((await processActivityWatchEvents(user, events, 'phone', true)).status).toBe('success')
  expect((await processActivityWatchEvents(user, [...events].reverse(), 'phone', true)).events_total).toBe(3)
  expect((await processActivityWatchEvents(user, [event('1')], 'desktop')).events_total).toBe(1)
  const view = await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02'))
  expect(view).toHaveLength(2)
  expect(view.find((r) => r.device_name === 'phone')?.duration_sec).toBe(121)
})

test('corrected source identity retracts stale projection without duplicate time', async () => {
  const user = getTestUser()
  await processActivityWatchEvents(user, [event('1')], 'phone', true)
  await processActivityWatchEvents(
    user,
    [event('1', { app: 'Corrected app', timestamp: '2025-01-01T13:00:00Z' })],
    'phone',
    true,
  )
  const view = await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02'))
  expect(view.map((r) => r.activity)).toEqual(['Corrected app'])
  expect((await query(user, 'SELECT * FROM activitywatch_observations')).rows).toHaveLength(1)
})

test('AFK observations and recreated bucket instances are retained without counting idle time', async () => {
  const user = getTestUser()
  await processActivityWatchEvents(user, [event('1', { is_afk: true })], 'phone', true)
  expect(await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02'))).toHaveLength(0)
  await processActivityWatchEvents(
    user,
    [event('1', { source_instance: 'replacement', timestamp: '2025-01-01T13:00:00Z' })],
    'phone',
    true,
  )
  expect((await query(user, 'SELECT * FROM activitywatch_observations')).rows).toHaveLength(2)
  expect(await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02'))).toHaveLength(1)
})

test('screen-time buckets union overlapping devices and split at hour boundaries', async () => {
  const { getProductivityBucketed } = await import('../../db/productivity.ts')
  const user = getTestUser()
  await processActivityWatchEvents(
    user,
    [event('1', { timestamp: '2025-01-01T10:59:00Z', duration: 120 })],
    'phone',
    true,
  )
  await processActivityWatchEvents(
    user,
    [event('1', { timestamp: '2025-01-01T11:00:00Z', duration: 120 })],
    'desktop',
  )
  const buckets = await getProductivityBucketed(
    user,
    new Date('2025-01-01T10:00:00Z'),
    new Date('2025-01-01T12:00:00Z'),
    '1 hour',
  )
  expect(buckets.map((b) => b.total_sec)).toEqual([60, 120])
  expect(
    (await query(user, 'SELECT COUNT(*)::int AS count FROM activitywatch_observations')).rows[0].count,
  ).toBe(2)
})

test('different batch order and heartbeat corrections rebuild exactly the canonical spans', async () => {
  const { insertScreentimeCategory } = await import('../../db/screentime-categories.ts')
  const user = getTestUser()
  await insertScreentimeCategory(user, {
    name: ['Work'],
    rule_type: 'regex',
    rule_regex: 'Synthetic',
    sort_order: 0,
  })
  const first = event('1', { timestamp: '2025-01-01T10:00:00Z', duration: 120 })
  const second = event('2', { timestamp: '2025-01-01T10:02:00Z', duration: 120 })
  await processActivityWatchEvents(user, [second], 'phone', true)
  await processActivityWatchEvents(user, [first], 'phone', true)
  await processActivityWatchEvents(user, [first, second], 'phone', true)
  const spans = await query(
    user,
    "SELECT start_time,end_time FROM activities WHERE source='activitywatch' AND deleted_at IS NULL",
  )
  expect(spans.rows).toHaveLength(1)
  expect(new Date(spans.rows[0].end_time).toISOString()).toBe('2025-01-01T10:04:00.000Z')
  await processActivityWatchEvents(user, [{ ...second, duration: 180 }], 'phone', true)
  const updated = await query(
    user,
    "SELECT start_time,end_time FROM activities WHERE source='activitywatch' AND deleted_at IS NULL",
  )
  expect(updated.rows).toHaveLength(1)
  expect(new Date(updated.rows[0].end_time).toISOString()).toBe('2025-01-01T10:05:00.000Z')
  const { getChartData } = await import('../../services/chart-data.ts')
  const chart = await getChartData(user, {
    aggregation: 'sum',
    bucket_size: '1d',
    start: '2025-01-01T00:00:00Z',
    end: '2025-01-02T00:00:00Z',
    pattern: 'Work',
    source_type: 'productivity_category',
  })
  expect('value' in chart.buckets[0] ? chart.buckets[0].value : undefined).toBeCloseTo(5 / 60)
})

test('real REST ingestion exposes persisted events, coverage and analytics through read routes', async () => {
  const { default: express } = await import('express')
  const { default: request } = await import('supertest')
  const { createSyncRouter } = await import('../../sync-router.ts')
  const { createProductivityRouter } = await import('../../routes/productivity-router.ts')
  const { getActivityWatchDevices } = await import('../../db/activitywatch.ts')
  const app = express()
  app.use(express.json())
  const auth: RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer synthetic-test') {
      res.sendStatus(401)
      return
    }
    req.user = getTestUser()
    next()
  }
  const deps = {
    processActivityWatchEvents,
    getActivityWatchDevices,
    getActivityWatchSyncStates: async () => [],
  } as unknown as SyncRouterDeps
  app.use('/sync', createSyncRouter(deps, auth))
  app.use('/productivity', createProductivityRouter(auth))
  expect(
    (
      await request(app)
        .post('/sync/activitywatch')
        .send({ events: [event('1')] })
    ).status,
  ).toBe(401)
  const send = () =>
    request(app)
      .post('/sync/activitywatch')
      .set('Authorization', 'Bearer synthetic-test')
      .send({ events: [event('1')], device_name: 'pixel_9_pro', is_mobile: true })
  expect((await send()).body.result.events_total).toBe(1)
  expect((await send()).body.result.events_total).toBe(1)
  const status = await request(app)
    .get('/sync/activitywatch/status')
    .set('Authorization', 'Bearer synthetic-test')
  expect(status.body.devices[0]).toMatchObject({
    device_name: 'pixel_9_pro',
    events_total: 1,
    is_mobile: true,
  })
  const view = await request(app)
    .get('/productivity')
    .query({ start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z' })
    .set('Authorization', 'Bearer synthetic-test')
  expect(view.body.data).toHaveLength(1)
  expect(view.body.data[0]).toMatchObject({
    device_name: 'pixel_9_pro',
    activity: 'Synthetic app',
    source: 'activitywatch',
  })
  const chart = await request(app)
    .get('/productivity/bucketed')
    .query({ start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z', bucket: '1h' })
    .set('Authorization', 'Bearer synthetic-test')
  expect(chart.status).toBe(200)
  expect(
    chart.body.buckets.reduce((sum: number, b: { total_sec: number }) => sum + b.total_sec, 0),
  ).toBeCloseTo(60.125)
})

test('fractional aggregates satisfy the shared response schemas', async () => {
  const { distinctAppSchema, screentimeBucketSchema } = await import('@aurboda/api-spec')
  const { getDistinctApps, getProductivityBucketed } = await import('../../db/productivity.ts')
  const { assembleScreentimeBuckets } = await import('../../services/queries/productivity.ts')
  const user = getTestUser()
  await processActivityWatchEvents(user, [event('fraction')], 'phone', true)
  const apps = await getDistinctApps(user)
  expect(
    distinctAppSchema.parse({ ...apps[0], last_seen: apps[0].last_seen.toISOString() }).total_duration_sec,
  ).toBe(60.125)
  const rows = await getProductivityBucketed(user, new Date('2025-01-01'), new Date('2025-01-02'), '1 hour')
  expect(screentimeBucketSchema.parse(assembleScreentimeBuckets(rows, 3600000)[0]).total_sec).toBe(60.125)
})

test('both repeated DST hours survive and calendar-day bounds include the extra hour', async () => {
  const { getProductivityBucketed } = await import('../../db/productivity.ts')
  const user = getTestUser()
  await processActivityWatchEvents(
    user,
    [
      event('first', { timestamp: '2026-11-01T07:30:00Z', duration: 900 }),
      event('second', { timestamp: '2026-11-01T08:30:00Z', duration: 900 }),
    ],
    'phone',
    true,
  )
  const start = new Date('2026-11-01T06:00:00Z'),
    end = new Date('2026-11-02T07:00:00Z')
  const hours = await getProductivityBucketed(user, start, end, '1 hour', 'America/Denver')
  expect(hours.map((r) => [r.bucket_start.toISOString(), r.total_sec])).toEqual([
    ['2026-11-01T07:00:00.000Z', 900],
    ['2026-11-01T08:00:00.000Z', 900],
  ])
  const days = await getProductivityBucketed(user, start, end, '1 day', 'America/Denver')
  expect(days).toHaveLength(1)
  expect(days[0].total_sec).toBe(1800)
  expect(days[0].bucket_end?.toISOString()).toBe(end.toISOString())
})

test('spring-forward calendar day keeps activity on both sides of the skipped hour', async () => {
  const { getProductivityBucketed } = await import('../../db/productivity.ts')
  const user = getTestUser()
  await processActivityWatchEvents(
    user,
    [
      event('before', { timestamp: '2026-03-08T08:30:00Z', duration: 900 }),
      event('after', { timestamp: '2026-03-08T09:30:00Z', duration: 900 }),
    ],
    'phone',
    true,
  )
  const start = new Date('2026-03-08T07:00:00Z'),
    end = new Date('2026-03-09T06:00:00Z')
  const days = await getProductivityBucketed(user, start, end, '1 day', 'America/Denver')
  expect(days).toHaveLength(1)
  expect(days[0].total_sec).toBe(1800)
  expect(days[0].bucket_end?.toISOString()).toBe(end.toISOString())
})

test('excluded desktop activity cannot suppress included simultaneous phone activity', async () => {
  const { insertScreentimeCategory } = await import('../../db/screentime-categories.ts')
  const { queryProductivity } = await import('../../services/queries/productivity.ts')
  const user = getTestUser()
  await insertScreentimeCategory(user, {
    name: ['Idle'],
    rule_type: 'regex',
    rule_regex: 'Idle',
    exclude_from_screentime: true,
    sort_order: 0,
  })
  await insertScreentimeCategory(user, {
    name: ['Work'],
    rule_type: 'regex',
    rule_regex: 'Work',
    sort_order: 1,
  })
  await processActivityWatchEvents(user, [event('idle', { app: 'Idle', duration: 60 })], 'desktop')
  await processActivityWatchEvents(user, [event('work', { app: 'Work', duration: 60 })], 'phone', true)
  const spans = await query(
    user,
    "SELECT start_time,end_time FROM activities WHERE source='activitywatch' AND deleted_at IS NULL",
  )
  expect(spans.rows).toHaveLength(1)
  expect(new Date(spans.rows[0].end_time).getTime() - new Date(spans.rows[0].start_time).getTime()).toBe(
    60000,
  )
  const view = await queryProductivity(
    user,
    new Date('2025-01-01'),
    new Date('2025-01-02'),
    undefined,
    'category',
  )
  expect(view.data).toHaveLength(1)
  expect(view.data[0]).toMatchObject({ resolved_category: ['Work'], duration_sec: 60 })
})

test('equal projection collisions select the same bucket generation in either import order', async () => {
  const user = getTestUser()
  const older = event('1', { source_instance: 'a', source_data: { title: 'older' } })
  const newer = event('1', { source_instance: 'b', source_data: { title: 'newer' } })
  await processActivityWatchEvents(user, [newer, older], 'phone', true)
  expect((await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02')))[0].title).toBe('older')
  await processActivityWatchEvents(user, [older, newer], 'phone', true)
  expect((await getProductivity(user, new Date('2025-01-01'), new Date('2025-01-02')))[0].title).toBe('older')
})
