// @vitest-environment jsdom
import type { TodayResponse } from '@aurboda/api-spec'

import { signal } from '@preact/signals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { auth } from '../state/auth'
import { HomeRegimens } from './HomeRegimens'

const api = vi.hoisted(() => ({ fetchPharmacologyToday: vi.fn(), fetchUserSettings: vi.fn() }))
vi.mock('../state/api', () => api)
vi.mock('../state/auth', () => ({ auth: signal({ token: 'test', user: 'test' }) }))
vi.mock('../state/api/family-photos', () => ({ useFamilyAccess: () => ({ data: { allowed: false } }) }))

type Today = TodayResponse['data']
type Due = Today['due_regimens'][number]
const due = (id = 'morning', changes: Partial<Due> = {}): Due => ({
  regimen: {
    id,
    name: id === 'morning' ? 'Morning supplements' : id,
    items: [
      { id: 'one', paused: false },
      { id: 'two', paused: false },
    ],
  } as Due['regimen'],
  state: 'pending',
  confirmed_item_ids: [],
  incomplete_item_ids: [],
  ...changes,
})
let root: HTMLDivElement
let client: QueryClient
let today: Today
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
}
const mount = async () => {
  await act(async () =>
    render(
      <QueryClientProvider client={client}>
        <HomeRegimens />
      </QueryClientProvider>,
      root,
    ),
  )
  await flush()
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
  auth.value = { token: 'test', user: 'test' }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = document.createElement('div')
  document.body.append(root)
  today = {
    date: '2026-11-25',
    timezone: 'UTC',
    due_regimens: [due()],
    assessment_completion: [],
    upcoming_treatments: [],
    recent_administrations: [],
    incomplete_items: [],
  }
  api.fetchUserSettings.mockResolvedValue({ hidden_pages: [] })
  api.fetchPharmacologyToday.mockImplementation(async () => today)
})
afterEach(() => {
  act(() => render(null, root))
  client.clear()
  root.remove()
  vi.useRealTimers()
})

it('links each Review to the existing dated regimen confirmation screen', async () => {
  await mount()
  expect(root.textContent).toContain('Morning supplements')
  const link = root.querySelector('a[aria-label="Review Morning supplements"]')
  expect(link?.textContent).toBe('Review')
  expect(link?.getAttribute('href')).toBe(
    '/treatments?view=today&action=confirm&regimen=morning&date=2026-11-25',
  )
  expect(api.fetchPharmacologyToday).toHaveBeenCalledWith({ date: '2026-11-25', timezone: 'UTC' })
  expect(client.getQueryData(['pharmacology', 'today', '2026-11-25', 'UTC'])).toEqual(today)
})

it.each(['confirmed', 'skipped', 'unknown', 'partial'] as const)(
  'labels fully recorded %s outcomes Recorded, without implying Taken',
  async (state) => {
    today.due_regimens = [due('Completed', { state, confirmed_item_ids: ['one', 'two'] })]
    await mount()
    expect(root.textContent).toContain('Recorded')
    expect(root.textContent).not.toContain('Taken')
    expect(root.querySelector('a[aria-label^="Review"]')).toBeNull()
  },
)

it('allows partially recorded regimens to be reviewed and leaves paused ones unavailable', async () => {
  const paused = due('Paused stack')
  paused.regimen.items = paused.regimen.items.map((item) => ({ ...item, paused: true }))
  today.due_regimens = [due('Partial', { state: 'partial', confirmed_item_ids: ['one'] }), paused]
  await mount()
  expect(root.querySelectorAll('a[aria-label^="Review"]')).toHaveLength(1)
  expect(root.querySelector('a[aria-label="Review Partial"]')).not.toBeNull()
  expect(root.textContent).toContain('Paused')
})

it('hides the box and does not fetch when Treatments is hidden', async () => {
  client.setQueryData(['userSettings'], { hidden_pages: ['/treatments'] })
  api.fetchUserSettings.mockResolvedValue({ hidden_pages: ['/treatments'] })
  await mount()
  expect(root.textContent).toBe('')
  expect(api.fetchPharmacologyToday).not.toHaveBeenCalled()
})

it.each([true, false])(
  'waits for deferred settings before fetching or showing regimens (hidden=%s)',
  async (hidden) => {
    let resolveSettings!: (settings: { hidden_pages: string[] }) => void
    api.fetchUserSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve
        }),
    )
    await mount()
    expect(root.textContent).toBe('')
    expect(api.fetchPharmacologyToday).not.toHaveBeenCalled()
    await act(async () => resolveSettings({ hidden_pages: hidden ? ['/treatments'] : [] }))
    await flush()
    await flush()
    if (hidden) {
      expect(root.textContent).toBe('')
      expect(api.fetchPharmacologyToday).not.toHaveBeenCalled()
    } else {
      expect(root.textContent).toContain('Morning supplements')
      expect(api.fetchPharmacologyToday).toHaveBeenCalledTimes(1)
    }
  },
)

it('does not fetch or show private regimens while logged out', async () => {
  auth.value = { token: '', user: '' }
  await mount()
  expect(root.textContent).toBe('')
  expect(api.fetchPharmacologyToday).not.toHaveBeenCalled()
})

it('shows loading, an actionable failure, and the empty state after retry', async () => {
  let reject!: (error: Error) => void
  api.fetchPharmacologyToday.mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectPlan) => {
        reject = rejectPlan
      }),
  )
  await mount()
  expect(root.textContent).toContain('Loading regimens…')
  await act(async () => reject(new Error('offline')))
  await flush()
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Regimens could not load.')
  today.due_regimens = []
  await act(async () => root.querySelector<HTMLButtonElement>('button')?.click())
  await flush()
  expect(root.textContent).toContain('No regimens scheduled today.')
})

it('refreshes every minute and switches the plan and Review link after midnight', async () => {
  vi.setSystemTime(new Date('2026-11-25T23:59:30Z'))
  await mount()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  await flush()
  expect(api.fetchPharmacologyToday).toHaveBeenLastCalledWith({ date: '2026-11-26', timezone: 'UTC' })
  expect(root.querySelector('a[aria-label^="Review"]')?.getAttribute('href')).toContain('date=2026-11-26')
  const count = api.fetchPharmacologyToday.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  await flush()
  expect(api.fetchPharmacologyToday.mock.calls.length).toBeGreaterThan(count)
})

it('updates the date immediately when returning to the window after midnight', async () => {
  await mount()
  vi.setSystemTime(new Date('2026-11-26T08:00:00Z'))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  await flush()
  expect(api.fetchPharmacologyToday).toHaveBeenLastCalledWith({ date: '2026-11-26', timezone: 'UTC' })
})
