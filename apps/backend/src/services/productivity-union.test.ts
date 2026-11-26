import { expect, test } from 'vitest'

import type { ProductivityRecord } from '../db/types.ts'

import { allocateProductivity } from './productivity-union.ts'
const record = (id: string, start: number, end: number, category: string): ProductivityRecord => ({
  id,
  activity: id,
  device_name: id,
  source: 'activitywatch',
  start_time: new Date(start * 1000),
  end_time: new Date(end * 1000),
  duration_sec: end - start,
  resolved_category: [category],
})
test('overlapping phone and desktop time is counted once with deterministic category attribution', () => {
  const records = [record('phone', 0, 120, 'B'), record('desktop', 60, 180, 'A')]
  const result = allocateProductivity(records)
  expect(result.reduce((sum, r) => sum + r.duration_sec, 0)).toBe(180)
  expect(
    result.filter((r) => r.resolved_category?.[0] === 'A').reduce((sum, r) => sum + r.duration_sec, 0),
  ).toBe(120)
  expect(allocateProductivity([...records].reverse())).toEqual(result)
  expect(records[0].duration_sec).toBe(120)
})
test('clips at range bounds without inventing time in gaps or zero-duration events', () => {
  const records = [record('a', 0, 30, 'A'), record('b', 60, 90, 'A'), record('zero', 40, 40, 'A')]
  expect(
    allocateProductivity(records, new Date(10000), new Date(80000)).reduce(
      (sum, r) => sum + r.duration_sec,
      0,
    ),
  ).toBe(40)
})
