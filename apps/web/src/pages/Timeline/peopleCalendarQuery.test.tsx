// @vitest-environment jsdom
import type { PeopleCalendarOccurrence } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { fetchPeopleCalendar } from '../../state/api/people'
import { auth } from '../../state/auth'
import { useTimelineData } from './useTimelineData'

vi.mock('../../state/api', () => ({
  fetchActivities: vi.fn(async () => []),
  fetchActivityTypeDefinitions: vi.fn(async () => []),
  fetchBucketedMetrics: vi.fn(async () => ({ buckets: [] })),
  fetchCommentsInRange: vi.fn(async () => []),
  fetchMeals: vi.fn(async () => ({ meals: [] })),
  fetchScreentimeCategories: vi.fn(async () => []),
  fetchScreentimeBucketed: vi.fn(async () => []),
  fetchTrainingLoad: vi.fn(async () => ({})),
  fetchUserSettings: vi.fn(async () => ({})),
  selectItemIcons: () => ({}),
}))
vi.mock('../../state/api/people', () => ({ fetchPeopleCalendar: vi.fn() }))
vi.mock('../../state/auth', async () => {
  const { signal } = await import('@preact/signals')
  return { auth: signal({ user: 'alice', token: 'alice-token' }) }
})
const occurrence: PeopleCalendarOccurrence = {
  id: 'one',
  person_id: 'private',
  person_name: 'Alice private person',
  date_id: 'birthday',
  label: 'Birthday',
  date: '2030-01-01',
  start_time: '2030-01-01T00:00:00Z',
  end_time: '2030-01-02T00:00:00Z',
  source: 'profile',
  kind: 'birthday',
  anniversary_number: null,
  ideas: [],
}
let container: HTMLDivElement
let client: QueryClient
function TimelineDataView({ end = '2030-01-02T00:00:00Z' }: { end?: string }) {
  const data = useTimelineData({
    fetchStart: new Date('2026-01-01T00:00:00Z'),
    fetchEnd: new Date('2026-01-02T00:00:00Z'),
    viewStart: new Date('2030-01-01T00:00:00Z'),
    viewEnd: new Date(end),
    fromDateKey: '2026-01-01',
    toDateKey: '2026-01-02',
    hiddenCategories: new Set(),
    bucketSize: '1d',
    barBucketSize: '1d',
    mergeGapMs: 0,
    splitAbutting: false,
    collapseDepth: 0,
  })
  return (
    <div>
      {data.chartItems.map((item) => (
        <p key={item.href}>{item.label}</p>
      ))}
      {data.errorSources.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  auth.value = { user: 'alice', token: 'alice-token' }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => {
  render(null, container)
  container.remove()
  client.clear()
})
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
test('private calendar uses visible future dates and never shows previous-user placeholder data', async () => {
  vi.mocked(fetchPeopleCalendar).mockResolvedValue([occurrence])
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <TimelineDataView />
      </QueryClientProvider>,
      container,
    ),
  )
  await settle()
  expect(fetchPeopleCalendar).toHaveBeenCalledWith({ from: '2029-12-31', to: '2030-01-03' }, 'alice-token')
  expect(container.textContent).toContain('Alice private person')
  let resolveBob: (value: PeopleCalendarOccurrence[]) => void = () => {}
  vi.mocked(fetchPeopleCalendar).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveBob = resolve
      }),
  )
  act(() => {
    auth.value = { user: 'bob', token: 'bob-token' }
  })
  expect(container.textContent).not.toContain('Alice private person')
  await act(async () => {
    resolveBob([])
  })
  await settle()
  expect(container.textContent).not.toContain('Alice private person')
})
test('overwide calendar views show an actionable range error without a request', async () => {
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <TimelineDataView end="2050-01-01T00:00:00Z" />
      </QueryClientProvider>,
      container,
    ),
  )
  await settle()
  expect(fetchPeopleCalendar).not.toHaveBeenCalled()
  expect(container.textContent).toContain('3,660 days')
})
