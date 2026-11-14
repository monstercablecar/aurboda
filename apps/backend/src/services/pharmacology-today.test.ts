import type {
  AdministrationEvent,
  Assessment,
  QuestionnaireTemplate,
  Regimen,
  TreatmentSession,
} from '@aurboda/api-spec'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import * as db from '../db/pharmacology.ts'
import { getToday } from './pharmacology.ts'

vi.mock('../db/pharmacology.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof db>()),
  listRegimens: vi.fn(),
  listAdministrations: vi.fn(),
  listQuestionnaires: vi.fn(),
  listAssessments: vi.fn(),
  listTreatmentSessions: vi.fn(),
}))

const setItems = (...times: (string | undefined)[]) => {
  vi.mocked(db.listRegimens).mockResolvedValue([
    {
      id: 'stack',
      schedule: { type: 'daily' },
      items: times.map((scheduled_local_time, index) => ({
        id: `item-${index}`,
        paused: false,
        scheduled_local_time,
      })),
    } as Regimen,
  ])
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-12T17:00:00Z')) // 10 AM in Denver
  vi.mocked(db.listAdministrations).mockResolvedValue([])
  vi.mocked(db.listQuestionnaires).mockResolvedValue([])
  vi.mocked(db.listAssessments).mockResolvedValue([])
  vi.mocked(db.listTreatmentSessions).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('Today reconciliation timing', () => {
  test.each([undefined, '2026-11-12'])('keeps later items upcoming with date %s', async (date) => {
    setItems('18:00')
    const today = await getToday('user', 'America/Denver', date)
    expect(today.due_regimens[0].state).toBe('not_yet_due')
    expect(today.due_regimens[0].incomplete_item_ids).toEqual([])
    expect(today.incomplete_items).toEqual([])
  })

  test('does not flag unscheduled or scheduled future-day items', async () => {
    setItems(undefined, '08:00')
    const today = await getToday('user', 'America/Denver', '2026-11-13')
    expect(today.due_regimens[0].state).toBe('not_yet_due')
    expect(today.incomplete_items).toEqual([])
  })

  test('requires reconciliation for past dates including unscheduled items', async () => {
    setItems(undefined, '23:00')
    const today = await getToday('user', 'America/Denver', '2026-11-11')
    expect(today.due_regimens[0].state).toBe('pending')
    expect(today.due_regimens[0].incomplete_item_ids).toEqual(['item-0', 'item-1'])
  })

  test('only flags elapsed scheduled items in a mixed stack', async () => {
    setItems('08:00', '18:00', undefined)
    const today = await getToday('user', 'America/Denver', '2026-11-12')
    expect(today.due_regimens[0].state).toBe('pending')
    expect(today.incomplete_items).toEqual([{ regimen_id: 'stack', item_id: 'item-0' }])
  })

  test('unscheduled today is pending without claiming it is overdue', async () => {
    setItems(undefined)
    const today = await getToday('user', 'America/Denver', '2026-11-12')
    expect(today.due_regimens[0].state).toBe('pending')
    expect(today.incomplete_items).toEqual([])
  })

  test('does not ask to reconcile an already recorded elapsed item', async () => {
    setItems('08:00', '18:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([
      {
        regimen_item_id: 'item-0',
        status: 'taken',
        administered_at: '2026-11-12T15:00:00Z',
      } as AdministrationEvent,
    ])
    const today = await getToday('user', 'America/Denver', '2026-11-12')
    expect(today.due_regimens[0].confirmed_item_ids).toEqual(['item-0'])
    expect(today.due_regimens[0].state).toBe('partial')
    expect(today.incomplete_items).toEqual([])
  })

  test('uses the requested timezone across the UTC date boundary', async () => {
    vi.setSystemTime(new Date('2026-11-13T01:00:00Z')) // Still November 12 in Denver
    setItems('20:00')
    const today = await getToday('user', 'America/Denver', '2026-11-12')
    expect(today.due_regimens[0].state).toBe('not_yet_due')
    expect(today.incomplete_items).toEqual([])
  })
})

describe('Today projection integrity', () => {
  const administration = (item: string, at: string, status: AdministrationEvent['status'] = 'taken') =>
    ({ regimen_item_id: item, administered_at: at, created_at: at, status }) as AdministrationEvent

  test('excludes next-day midnight records while including selected-day midnight', async () => {
    setItems('08:00', '09:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([
      administration('item-0', '2026-11-12T07:00:00Z'),
      administration('item-1', '2026-11-13T07:00:00Z'),
    ])
    vi.mocked(db.listQuestionnaires).mockResolvedValue([
      { id: 'morning', enabled: true },
      { id: 'evening', enabled: true },
    ] as QuestionnaireTemplate[])
    vi.mocked(db.listAssessments).mockResolvedValue([
      { template_id: 'morning', assessed_at: '2026-11-12T07:00:00Z' },
      { template_id: 'evening', assessed_at: '2026-11-13T07:00:00Z' },
    ] as Assessment[])
    const today = await getToday('user', 'America/Denver', '2026-11-12')
    expect(today.recent_administrations).toHaveLength(1)
    expect(today.due_regimens[0].confirmed_item_ids).toEqual(['item-0'])
    expect(today.due_regimens[0].incomplete_item_ids).toEqual(['item-1'])
    expect(today.assessment_completion).toEqual([
      { template_id: 'morning', completed: true },
      { template_id: 'evening', completed: false },
    ])
  })

  test('duplicate records for one item cannot confirm an unrecorded second item', async () => {
    setItems('08:00', '09:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([
      administration('item-0', '2026-11-12T15:00:00Z'),
      administration('item-0', '2026-11-12T16:00:00Z'),
    ])
    const today = await getToday('user', 'America/Denver')
    expect(today.due_regimens[0].state).toBe('partial')
    expect(today.due_regimens[0].incomplete_item_ids).toEqual(['item-1'])
  })

  test('uses the latest outcome per item regardless of input ordering', async () => {
    setItems('08:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([
      administration('item-0', '2026-11-12T15:00:00Z', 'taken'),
      administration('item-0', '2026-11-12T16:00:00Z', 'unknown'),
    ])
    expect((await getToday('user', 'America/Denver')).due_regimens[0].state).toBe('unknown')
  })

  test.each(['skipped', 'unknown', 'canceled'] as const)(
    'keeps a stack partial when only one item is recorded as %s',
    async (status) => {
      setItems('08:00', '09:00')
      vi.mocked(db.listAdministrations).mockResolvedValue([
        administration('item-0', '2026-11-12T15:00:00Z', status),
      ])
      const today = await getToday('user', 'America/Denver')
      expect(today.due_regimens[0].state).toBe('partial')
      expect(today.due_regimens[0].incomplete_item_ids).toEqual(['item-1'])
    },
  )

  test.each([
    ['taken', 'canceled', 'partial'],
    ['canceled', 'canceled', 'skipped'],
    ['skipped', 'canceled', 'skipped'],
    ['unknown', 'unknown', 'unknown'],
  ] as const)('classifies complete outcomes %s and %s as %s', async (first, second, expected) => {
    setItems('08:00', '09:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([
      administration('item-0', '2026-11-12T15:00:00Z', first),
      administration('item-1', '2026-11-12T16:00:00Z', second),
    ])
    const today = await getToday('user', 'America/Denver')
    expect(today.due_regimens[0].state).toBe(expected)
    expect(today.due_regimens[0].incomplete_item_ids).toEqual([])
  })

  test('does not count an entry marked entered in error as confirmation', async () => {
    setItems('08:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([
      administration('item-0', '2026-11-12T15:00:00Z', 'entered_in_error'),
    ])
    const today = await getToday('user', 'America/Denver')
    expect(today.due_regimens[0].state).toBe('pending')
    expect(today.due_regimens[0].incomplete_item_ids).toEqual(['item-0'])
  })

  test('only returns scheduled active items in the stack shown for the selected day', async () => {
    vi.mocked(db.listRegimens).mockResolvedValue([
      {
        id: 'stack',
        schedule: { type: 'daily' },
        items: [
          { id: 'due' },
          { id: 'paused', paused: true },
          { id: 'later', start_date: '2026-11-13' },
          { id: 'ended', end_date: '2026-11-11' },
          { id: 'off-day', schedule_override: { type: 'specific_date', date: '2026-11-13' } },
        ],
      } as Regimen,
    ])
    const today = await getToday('user', 'America/Denver')
    expect(today.due_regimens[0].regimen.items.map((item) => item.id)).toEqual(['due'])
  })

  test.each([
    ['2026-11-13', undefined, false],
    [undefined, '2026-11-11', false],
    ['2026-11-12', undefined, true],
    [undefined, '2026-11-12', true],
    ['2026-11-12', '2026-11-12', true],
  ])('respects stack bounds %s through %s inclusively', async (start_date, end_date, expected) => {
    vi.mocked(db.listRegimens).mockResolvedValue([
      {
        id: 'stack',
        schedule: { type: 'daily' },
        start_date,
        end_date,
        items: [{ id: 'item', scheduled_local_time: '08:00' }],
      } as Regimen,
    ])
    const today = await getToday('user', 'America/Denver', '2026-11-12')
    expect(today.due_regimens).toHaveLength(expected ? 1 : 0)
    expect(today.incomplete_items).toHaveLength(expected ? 1 : 0)
  })

  test('upcoming sessions are unstarted plans in chronological order', async () => {
    setItems('08:00')
    vi.mocked(db.listTreatmentSessions).mockResolvedValue([
      { id: 'later', status: 'planned', planned_at: '2026-11-13T17:00:00Z' },
      { id: 'now', status: 'planned', planned_at: '2026-11-12T17:00:00Z' },
      { id: 'past', status: 'planned', planned_at: '2026-11-12T16:00:00Z' },
      { id: 'canceled', status: 'canceled', planned_at: '2026-11-12T18:00:00Z' },
      { id: 'completed', status: 'completed', planned_at: '2026-11-12T18:00:00Z' },
      {
        id: 'started',
        status: 'planned',
        planned_at: '2026-11-12T18:00:00Z',
        actual_start: '2026-11-12T16:00:00Z',
      },
      { id: 'undated', status: 'planned' },
    ] as TreatmentSession[])
    const today = await getToday('user', 'America/Denver')
    expect(today.upcoming_treatments.map((session) => session.id)).toEqual(['now', 'later'])
  })

  test('non-current day upcoming cutoff is the selected day start', async () => {
    setItems('08:00')
    vi.mocked(db.listTreatmentSessions).mockResolvedValue([
      { id: 'selected', status: 'planned', planned_at: '2026-11-11T07:00:00Z' },
      { id: 'prior', status: 'planned', planned_at: '2026-11-11T06:59:59Z' },
    ] as TreatmentSession[])
    const today = await getToday('user', 'America/Denver', '2026-11-11')
    expect(today.upcoming_treatments.map((session) => session.id)).toEqual(['selected'])
  })
})


describe('bedtime completion across midnight', () => {
  test.each([
    ['2026-11-13T06:59:59Z', '2026-11-12', '2026-11-13'],
    ['2026-11-13T07:00:00Z', '2026-11-12', '2026-11-13'],
    ['2026-11-13T08:15:00Z', '2026-11-12', '2026-11-13'],
    ['2026-11-13T12:59:59Z', '2026-11-12', '2026-11-13'],
    ['2026-11-13T13:00:00Z', '2026-11-13', '2026-11-12'],
    ['2026-03-08T09:30:00Z', '2026-03-07', '2026-03-08'],
    ['2026-11-01T07:30:00Z', '2026-10-31', '2026-11-01'],
    ['2026-11-01T08:30:00Z', '2026-10-31', '2026-11-01'],
  ])('assigns %s to night %s only', async (at, night, otherDay) => {
    setItems('22:00')
    const event = { regimen_item_id: 'item-0', administered_at: at, created_at: at, status: 'taken' } as AdministrationEvent
    vi.mocked(db.listAdministrations).mockResolvedValue([event])
    expect((await getToday('user', 'America/Denver', night)).due_regimens[0].state).toBe('confirmed')
    expect((await getToday('user', 'America/Denver', otherDay)).due_regimens[0].confirmed_item_ids).toEqual([])
    expect(event.administered_at).toBe(at)
  })

  test('fetches through next-day 6 a.m. but keeps recent history on the actual day', async () => {
    setItems('22:00')
    const at = '2026-11-13T08:15:00Z'
    vi.mocked(db.listAdministrations).mockResolvedValue([
      { regimen_item_id: 'item-0', administered_at: at, created_at: at, status: 'taken' } as AdministrationEvent,
    ])
    const prior = await getToday('user', 'America/Denver', '2026-11-12')
    expect(db.listAdministrations).toHaveBeenCalledWith('user', '2026-11-12T07:00:00.000Z', '2026-11-13T13:00:00.000Z', 1000)
    expect(prior.due_regimens[0].state).toBe('confirmed')
    expect(prior.recent_administrations).toEqual([])
    const current = await getToday('user', 'America/Denver', '2026-11-13')
    expect(current.recent_administrations[0].administered_at).toBe(at)
    expect(current.due_regimens[0].confirmed_item_ids).toEqual([])
  })

  test('applies the cutoff to each item, leaving morning and unscheduled doses on their actual day', async () => {
    setItems('18:00', '17:59', '05:00', undefined)
    const at = '2026-11-13T12:00:00Z'
    vi.mocked(db.listAdministrations).mockResolvedValue([0, 1, 2, 3].map((index) => ({
      regimen_item_id: `item-${index}`, administered_at: at, created_at: at, status: 'taken',
    } as AdministrationEvent)))
    expect((await getToday('user', 'America/Denver', '2026-11-12')).due_regimens[0].confirmed_item_ids).toEqual(['item-0'])
    expect((await getToday('user', 'America/Denver', '2026-11-13')).due_regimens[0].confirmed_item_ids).toEqual(['item-1', 'item-2', 'item-3'])
  })

  test.each(['2026-11-13T05:00:00Z', '2026-11-14T05:00:00Z'])('uses the saved evening schedule %s even after the item time changes', async (scheduled_at) => {
    setItems('08:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([{
      regimen_item_id: 'item-0', administered_at: '2026-11-13T08:00:00Z', scheduled_at, status: 'taken',
    } as AdministrationEvent])
    expect((await getToday('user', 'America/Denver', '2026-11-12')).due_regimens[0].state).toBe('confirmed')
    expect((await getToday('user', 'America/Denver', '2026-11-13')).due_regimens[0].confirmed_item_ids).toEqual([])
  })

  test('uses the selected timezone rather than UTC for both boundaries', async () => {
    setItems('22:00')
    vi.mocked(db.listAdministrations).mockResolvedValue([{
      regimen_item_id: 'item-0', administered_at: '2026-11-12T16:00:00Z', status: 'taken',
    } as AdministrationEvent])
    expect((await getToday('user', 'Asia/Tokyo', '2026-11-12')).due_regimens[0].state).toBe('confirmed')
    expect((await getToday('user', 'Asia/Tokyo', '2026-11-13')).due_regimens[0].confirmed_item_ids).toEqual([])
  })
})
