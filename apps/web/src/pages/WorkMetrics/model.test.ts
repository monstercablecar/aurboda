import { describe, expect, test } from 'vitest'

import {
  buildStoredTotals,
  calculateDerivedTotals,
  calculateRates,
  deleteWorkDraft,
  emptyPositionValues,
  readWorkDraft,
  shouldCelebrateWorkday,
  sumDays,
  sumPositionValues,
  weeklyHires,
  writeWorkDraft,
} from './model'

describe('work metrics model', () => {
  test('keeps unfinished drafts isolated by account and workday', () => {
    const saved = new Map<string, string>()
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      removeItem: (key: string) => saved.delete(key),
      setItem: (key: string, value: string) => saved.set(key, value),
    }
    const values = emptyPositionValues()
    values.bmi_declines.server = 3
    values.sent_for_approval.deckhand = 2

    writeWorkDraft(storage, 'brighton', '2026-11-10', values, 'Entered during the day')

    expect(readWorkDraft(storage, 'brighton', '2026-11-10')).toEqual({
      note: 'Entered during the day',
      values,
    })
    expect(readWorkDraft(storage, 'someone-else', '2026-11-10')).toBeUndefined()
    expect(readWorkDraft(storage, 'brighton', '2026-11-09')).toBeUndefined()

    deleteWorkDraft(storage, 'brighton', '2026-11-10')
    expect(readWorkDraft(storage, 'brighton', '2026-11-10')).toBeUndefined()
  })

  test('discards malformed drafts instead of breaking the tracker', () => {
    const saved = new Map([['aurboda.work-metrics.draft.v1:brighton:2026-11-10', '{not-json']])
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      removeItem: (key: string) => saved.delete(key),
      setItem: (key: string, value: string) => saved.set(key, value),
    }

    expect(readWorkDraft(storage, 'brighton', '2026-11-10')).toBeUndefined()
    expect(saved.size).toBe(0)
  })

  test('collates position inputs into one daily total', () => {
    const values = emptyPositionValues()
    values.bmi_declines.server = 2
    values.bmi_declines.housekeeper = 3
    values.invited_to_interview.dishwasher = 4

    const totals = sumPositionValues(values)

    expect(totals.bmi_declines).toBe(5)
    expect(totals.invited_to_interview).toBe(4)
    expect(totals.no_shows).toBe(0)
  })

  test('matches the workbook funnel definitions', () => {
    const values = emptyPositionValues()
    const totals = sumPositionValues(values)
    Object.assign(totals, {
      bmi_declines: 2,
      location_declines: 1,
      application_response_declines: 3,
      job_hop_declines: 1,
      work_gap_declines: 4,
      overqualified_declines: 1,
      duplicate_declines: 2,
      invited_to_interview: 6,
      reschedules: 1,
      no_shows: 3,
      interview_deny_answers: 2,
      interview_deny_tattoo: 1,
      interview_deny_policy: 1,
      sent_for_approval: 5,
      approval_deny_grooming: 1,
      approval_deny_social_media: 1,
      offers_accepted: 2,
      offers_declined: 1,
    })

    expect(calculateDerivedTotals(totals)).toEqual({
      application_declines: 14,
      applications_reviewed: 20,
      approval_denials: 2,
      hires: 2,
      interview_appointments: 13,
      interview_decisions: 9,
      interview_denials: 4,
      offers_decided: 3,
    })

    const stored = buildStoredTotals(totals)
    expect(stored.work_hires).toBe(2)
    expect(stored.work_applications_reviewed).toBe(20)
    expect(stored.work_day_logged).toBe(1)
  })

  test('calculates rates from matching aggregate totals', () => {
    const rates = calculateRates({
      work_applications_reviewed: 40,
      work_approved: 6,
      work_hires: 4,
      work_interview_appointments: 20,
      work_interview_decisions: 12,
      work_invited_to_interview: 16,
      work_no_shows: 5,
      work_offers_accepted: 4,
      work_offers_decided: 5,
      work_reschedules: 3,
      work_sent_for_approval: 8,
    })

    expect(rates.invite_rate).toBe(0.4)
    expect(rates.interview_completion_rate).toBe(0.6)
    expect(rates.offer_acceptance_rate).toBe(0.8)
    expect(rates.approval_rate).toBe(0.75)
  })

  test('returns unavailable rates for zero denominators', () => {
    expect(calculateRates({}).invite_rate).toBeNull()
    expect(calculateRates({}).offer_acceptance_rate).toBeNull()
  })

  test('celebrates workdays with at least three hires', () => {
    expect(shouldCelebrateWorkday(2)).toBe(false)
    expect(shouldCelebrateWorkday(3)).toBe(true)
    expect(shouldCelebrateWorkday(7)).toBe(true)
  })

  test('sums periods and groups weekly hires without averaging rates', () => {
    const days = [
      { date: '2026-11-02', totals: { work_day_logged: 1, work_hires: 2 } },
      { date: '2026-11-06', totals: { work_day_logged: 1, work_hires: 3 } },
      { date: '2026-11-09', totals: { work_day_logged: 1, work_hires: 4 } },
    ]

    expect(sumDays(days).work_hires).toBe(9)
    expect(weeklyHires(days).map((week) => [week.start, week.hires])).toEqual([
      ['2026-11-02', 5],
      ['2026-11-09', 4],
    ])
  })
})
