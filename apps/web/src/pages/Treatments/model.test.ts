import type { Regimen } from '@aurboda/api-spec'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  actualVsScheduledLabel,
  buildConfirmRegimenBody,
  dueStateLabels,
  isoToLocalDateTime,
  localDateTimeToIso,
  regimenItemDrafts,
  scheduleSummary,
  stableActionKey,
  treatmentUrl,
} from './model'

afterEach(() => vi.unstubAllEnvs())

describe('pharmacology display helpers', () => {
  test('labels every server due state without treating unknown as skipped', () => {
    expect(dueStateLabels).toEqual({
      confirmed: 'Confirmed',
      not_yet_due: 'Not yet due',
      partial: 'Partial',
      pending: 'Pending',
      skipped: 'Skipped',
      unknown: 'Unknown',
    })
  })

  test('summarizes all recurrence shapes', () => {
    expect(scheduleSummary({ type: 'daily' })).toBe('Every day')
    expect(scheduleSummary({ type: 'weekdays', weekdays: [1, 3, 5] })).toBe(
      'Monday, Wednesday, Friday',
    )
    expect(scheduleSummary({ anchor_date: '2026-01-01', interval_days: 2, type: 'every_n_days' })).toBe(
      'Every 2 days from 2026-01-01',
    )
    expect(scheduleSummary({ type: 'weekly', weekday: 7 })).toBe('Every Sunday')
    expect(scheduleSummary({ day_of_month: 12, type: 'monthly' })).toBe('Monthly on day 12')
    expect(scheduleSummary({ date: '2026-11-09', type: 'specific_date' })).toBe('On 2026-11-09')
    expect(
      scheduleSummary({ anchor_at: '2026-11-09T10:00:00Z', interval_hours: 8, type: 'interval' }),
    ).toBe('Every 8 hours')
    expect(scheduleSummary({ type: 'as_needed' })).toBe('As needed')
    expect(scheduleSummary({ type: 'none' })).toBe('No schedule')
  })

  test('distinguishes actual and scheduled timestamps', () => {
    expect(actualVsScheduledLabel('2026-11-09T18:00:00Z')).toMatch(/^Administered /)
    expect(actualVsScheduledLabel('2026-11-09T18:00:00Z', '2026-11-09T17:00:00Z')).toContain(
      ' · scheduled ',
    )
  })
})

describe('date and URL helpers', () => {
  test('round trips a local time across the autumn DST fold as an explicit instant', () => {
    vi.stubEnv('TZ', 'America/Denver')
    const iso = localDateTimeToIso('2026-11-01T01:30')
    expect(isoToLocalDateTime(iso)).toBe('2026-11-01T01:30')
  })

  test('round trips after the spring DST transition', () => {
    vi.stubEnv('TZ', 'America/Denver')
    const iso = localDateTimeToIso('2026-03-08T03:30')
    expect(isoToLocalDateTime(iso)).toBe('2026-03-08T03:30')
  })

  test('preserves embedded mode while changing views and actions', () => {
    expect(treatmentUrl('embed=1&view=today', { action: 'prn', view: 'journal' })).toBe(
      '/treatments?embed=1&view=journal&action=prn',
    )
  })
})

describe('confirmation payload helpers', () => {
  const regimen = {
    id: '00000000-0000-4000-8000-000000000010',
    items: [
      {
        dose: 10,
        dose_unit: 'mg',
        id: '00000000-0000-4000-8000-000000000011',
        paused: false,
        regimen_id: '00000000-0000-4000-8000-000000000010',
        route: 'oral',
        sort_order: 0,
        substance: {
          analysis_key: 'example',
          display_name: 'Example',
          id: '00000000-0000-4000-8000-000000000012',
          status: 'active',
        },
        substance_id: '00000000-0000-4000-8000-000000000012',
      },
      {
        dose: 5,
        dose_unit: 'mg',
        id: '00000000-0000-4000-8000-000000000013',
        paused: false,
        regimen_id: '00000000-0000-4000-8000-000000000010',
        sort_order: 1,
        substance: {
          analysis_key: 'second',
          display_name: 'Second',
          id: '00000000-0000-4000-8000-000000000014',
          status: 'active',
        },
        substance_id: '00000000-0000-4000-8000-000000000014',
      },
    ],
  } as Regimen

  test('creates every item as selected and only submits selected items', () => {
    const drafts = regimenItemDrafts(regimen)
    drafts[1] = { ...drafts[1]!, selected: false }
    const body = buildConfirmRegimenBody({
      actualLocal: '2026-11-09T08:15',
      idempotencyKey: 'confirm:fixed',
      items: drafts,
      timezone: 'America/Denver',
    })
    expect(body.idempotency_key).toBe('confirm:fixed')
    expect(body.items).toEqual([
      {
        dose: 10,
        dose_unit: 'mg',
        item_id: '00000000-0000-4000-8000-000000000011',
        route: 'oral',
        side_effects: [],
        status: 'taken',
      },
    ])
  })

  test('makes one stable key per form open when the caller retains it', () => {
    const createId = vi.fn(() => 'uuid')
    const key = stableActionKey('confirm', createId)
    expect(key).toBe('confirm:uuid')
    expect(key).toBe(key)
    expect(createId).toHaveBeenCalledOnce()
  })
})
