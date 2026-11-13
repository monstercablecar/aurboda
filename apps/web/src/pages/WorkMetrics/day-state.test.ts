import type { QueryMetricsBucketedResponse } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import type { Activity } from '../../state/api/types'

import { latestWorkEntry, loadedWorkDayState } from './day-state'
import { createWorkGridValues, sumWorkGridValues, writeWorkDraft } from './model'
import {
  archiveWorkCategoryColumn,
  archiveWorkMetricRow,
  renameWorkMetricRow,
  resolveActiveWorkProfile,
  isRecruitingCompatibleProfile,
  setWorkCategoryColumnHidden,
} from './settings'

const date = '2026-11-10'
const profile = resolveActiveWorkProfile(undefined)
const response: QueryMetricsBucketedResponse = { success: true, buckets: [] }
const storage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}
const entry = (updated: string, value: number, profileId = profile.id): Activity => ({
  id: updated,
  activity_type: 'work_entry',
  source: 'aurboda',
  start_time: new Date(`${date}T12:00:00Z`),
  data: {
    work_date: date,
    profile_id: profileId,
    updated_at: updated,
    note: 'Saved note',
    values: { offers_accepted: { server: value, deckhand: 2 } },
  },
})

describe('Work day restoration', () => {
  test('waits for timestamped history instead of prematurely restoring totals', () => {
    expect(loadedWorkDayState(profile, response, [], undefined, storage(), 'alice', date)).toBeUndefined()
  })
  test('restores the newest matching entry, independent of response order', () => {
    const entries = [
      entry('2026-11-10T13:00:00Z', 1),
      entry('2026-11-10T15:00:00Z', 7, 'other'),
      entry('2026-11-10T14:00:00Z', 3),
    ]
    expect(latestWorkEntry(entries, profile.id, date)?.id).toBe('2026-11-10T14:00:00Z')
    const restored = loadedWorkDayState(profile, response, [], entries, storage(), 'alice', date)
    expect(restored?.values.offers_accepted).toMatchObject({ server: 3, deckhand: 2 })
    expect(restored?.note).toBe('Saved note')
    expect(restored?.savedAsCombined).toBe(false)
  })
  test('keeps unsaved edits ahead of saved history and isolates them by user and profile', () => {
    const drafts = storage()
    const values = createWorkGridValues(profile)
    values.offers_accepted.server = 9
    writeWorkDraft(drafts, 'alice', date, values, 'Unsaved note', profile.id)
    const entries = [entry('2026-11-10T13:00:00Z', 1)]
    expect(
      loadedWorkDayState(profile, response, [], entries, drafts, 'alice', date)?.values.offers_accepted
        .server,
    ).toBe(9)
    expect(
      loadedWorkDayState(profile, response, [], entries, drafts, 'bob', date)?.values.offers_accepted.server,
    ).toBe(1)
    expect(
      loadedWorkDayState({ ...profile, id: 'other' }, response, [], [], drafts, 'alice', date)?.values
        .offers_accepted.server,
    ).toBe(0)
  })
  test('retains archived cells and Recruiting calculations after cosmetic configuration changes', () => {
    const renamed = renameWorkMetricRow(profile, 'offers_accepted', 'Signed offers')
    const archived = archiveWorkMetricRow(
      archiveWorkCategoryColumn(renamed, 'deckhand', '2026-11-11T00:00:00Z'),
      'offers_accepted',
      '2026-11-11T00:00:00Z',
    )
    const restored = loadedWorkDayState(
      archived,
      response,
      [],
      [entry('2026-11-10T13:00:00Z', 3)],
      storage(),
      'alice',
      date,
    )
    expect(restored?.values.offers_accepted.deckhand).toBe(2)
    expect(sumWorkGridValues(archived, restored?.values ?? {}).offers_accepted).toBe(5)
    expect(isRecruitingCompatibleProfile(archived)).toBe(true)
    expect(isRecruitingCompatibleProfile(setWorkCategoryColumnHidden(profile, 'server', true))).toBe(true)
  })
  test('retains legacy daily totals when no detailed work entry exists', () => {
    const stats = (value: number) => ({
      avg: value,
      sum: value,
      count: 1,
      min: value,
      max: value,
      first_time: `${date}T12:00:00Z`,
      last_time: `${date}T12:00:00Z`,
    })
    const legacy: QueryMetricsBucketedResponse = {
      success: true,
      buckets: [
        {
          start: `${date}T00:00:00Z`,
          end: `${date}T23:59:59Z`,
          metrics: { work_day_logged: stats(1), work_offers_accepted: stats(6), work_hires: stats(6) },
        },
      ],
    }
    const loaded = loadedWorkDayState(
      profile,
      legacy,
      [{ content: 'Legacy note' }],
      [],
      storage(),
      'alice',
      date,
    )
    expect(loaded?.savedAsCombined).toBe(true)
    expect(loaded?.note).toBe('Legacy note')
    expect(loaded?.values.offers_accepted.server).toBe(6)
    expect(sumWorkGridValues(profile, loaded?.values ?? {}).offers_accepted).toBe(6)
  })
  test('falls back safely for malformed saved data', () => {
    const malformed = entry('2026-11-10T13:00:00Z', -1)
    expect(
      loadedWorkDayState(profile, response, [], [malformed], storage(), 'alice', date)?.values.offers_accepted
        .server,
    ).toBe(0)
  })
})
