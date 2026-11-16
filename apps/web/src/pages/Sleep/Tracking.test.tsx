// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'

import type { Activity } from '../../state/api'

import { advanceSessionGeneration } from '../../state/sessionBoundary'
import { SleepTracking } from './Tracking'
const api = vi.hoisted(() => ({ addActivity: vi.fn(), addEntityComment: vi.fn(), fetchActivities: vi.fn() }))
vi.mock('../../state/api', () => api)
let container: HTMLDivElement
let client: QueryClient
const sleep: Activity = {
  id: 'merged:night-id',
  activity_type: 'sleep',
  source: 'aurboda',
  start_time: new Date('2026-11-15T23:00Z'),
  end_time: new Date('2026-11-16T07:00Z'),
}
beforeEach(() => {
  vi.clearAllMocks()
  api.addActivity.mockResolvedValue({ success: true, data: { id: 'new-nap' } })
  api.addEntityComment.mockResolvedValue({ id: 'note' })
  api.fetchActivities.mockResolvedValue([])
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <SleepTracking sessions={[sleep]} onSaved={() => {}} />
      </QueryClientProvider>,
      container,
    ),
  )
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  client.clear()
})
const submit = async (index: number) => {
  await act(async () => {
    container
      .querySelectorAll('form')
      [index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
test('quick nap creates an ordinary nap and reports success only after confirmation', async () => {
  await submit(0)
  expect(api.addActivity).toHaveBeenCalledWith(
    expect.objectContaining({ activity_type: 'nap', title: 'Nap' }),
  )
  expect(container.textContent).toContain('Nap saved')
})
test('overlapping records prevent duplicate manual entries', async () => {
  api.fetchActivities.mockResolvedValue([
    { ...sleep, start_time: new Date(Date.now() - 3600000), end_time: new Date() },
  ])
  await submit(0)
  expect(api.addActivity).not.toHaveBeenCalled()
  expect(container.querySelector('[role=alert]')?.textContent).toContain('overlaps')
})
test('failed save keeps the draft and displays an error', async () => {
  api.addActivity.mockRejectedValue(new Error('Network unavailable'))
  const before = container.querySelector('input')!.value
  await submit(0)
  expect(container.querySelector('input')!.value).toBe(before)
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Network unavailable')
  expect(container.querySelector('[role=status]')).toBeNull()
})
test('blank check-in is not written; selected answers attach to the canonical session', async () => {
  await submit(1)
  expect(api.addEntityComment).not.toHaveBeenCalled()
  act(() => {
    const select = container.querySelectorAll('select')[1]
    select.value = 'Very rested'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await submit(1)
  expect(api.addEntityComment).toHaveBeenCalledWith(
    'activity',
    'night-id',
    'Sleep check-in\nFeeling on waking: Very rested',
  )
})
test('rapid duplicate submit cannot write twice', async () => {
  api.addActivity.mockImplementation(() => new Promise(() => {}))
  await submit(0)
  await submit(0)
  expect(api.addActivity).toHaveBeenCalledTimes(1)
})

test('overlapping rest does not block a nap', async () => {
  api.fetchActivities.mockResolvedValue([
    { ...sleep, activity_type: 'rest', start_time: new Date(Date.now() - 3600000), end_time: new Date() },
  ])
  await submit(0)
  expect(api.addActivity).toHaveBeenCalledTimes(1)
})

test('a drafted check-in stays on its selected session after a newer nap arrives', async () => {
  act(() => {
    const select = container.querySelectorAll('select')[1]
    select.value = 'Very rested'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <SleepTracking
          sessions={[{ ...sleep, id: 'new-nap', activity_type: 'nap', start_time: new Date() }, sleep]}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
      container,
    ),
  )
  await submit(1)
  expect(api.addEntityComment).toHaveBeenCalledWith(
    'activity',
    'night-id',
    'Sleep check-in\nFeeling on waking: Very rested',
  )
})

test('a session switch during the overlap request prevents a nap write', async () => {
  let finish: (value: Activity[]) => void = () => {}
  api.fetchActivities.mockImplementation(
    () =>
      new Promise<Activity[]>((resolve) => {
        finish = resolve
      }),
  )
  await submit(0)
  advanceSessionGeneration()
  await act(async () => {
    finish([])
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(api.addActivity).not.toHaveBeenCalled()
  expect(container.querySelector('[role=status]')).toBeNull()
})
