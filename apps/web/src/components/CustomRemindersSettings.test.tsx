// @vitest-environment jsdom
import type { Reminder } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { advanceSessionGeneration } from '../state/sessionBoundary'
import { CustomRemindersSettings } from './CustomRemindersSettings'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
}))
vi.mock('../state/api/reminders', () => ({ createRemindersClient: () => api }))
vi.mock('../state/api/settings', () => ({ fetchUserSettings: async () => ({ tz: 'America/Denver' }) }))
let root: HTMLDivElement
let client: QueryClient
const reminder: Reminder = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Evening check-in',
  time_of_day: '20:00',
  timezone: 'America/Denver',
  start_date: '2026-11-18',
  recurrence: 'daily',
  enabled: true,
  link: '/journal',
  next_due_at: '2026-11-19T03:00:00Z',
  created_at: '2026-11-17T20:00:00Z',
  updated_at: '2026-11-17T20:00:00Z',
}
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
const mount = async () => {
  await act(async () =>
    render(
      <QueryClientProvider client={client}>
        <CustomRemindersSettings />
      </QueryClientProvider>,
      root,
    ),
  )
  await flush()
}
const button = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!
const click = async (text: string) => {
  await act(async () => button(text).click())
  await flush()
}
const field = (label: string) =>
  [...root.querySelectorAll('label')]
    .find((node) => node.firstChild?.textContent === label)!
    .querySelector<HTMLInputElement>('input')!
const input = async (label: string, value: string) => {
  await act(async () => {
    const target = field(label)
    target.value = value
    target.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const submit = async () => {
  await act(async () => {
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  api.list.mockResolvedValue({ success: true, reminders: [], scheduler_ready: true })
  api.add.mockResolvedValue(reminder)
  api.update.mockResolvedValue(reminder)
  api.remove.mockResolvedValue(undefined)
  api.test.mockResolvedValue(true)
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
})
it('starts compact, saves a named reminder and offers the calendar copy only after saving', async () => {
  await mount()
  expect(root.querySelector('form')).toBeNull()
  expect(root.textContent).toContain('No custom notifications yet')
  await click('Add custom notification')
  await input('Name', ' Evening check-in ')
  await input('Start date', '2026-11-18')
  await input('Time zone', 'America/Denver')
  await act(async () => root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  expect(root.querySelector('a[href*="calendar.google"]')).toBeNull()
  await submit()
  expect(api.add).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Evening check-in',
      recurrence: 'daily',
      timezone: 'America/Denver',
      time_of_day: '20:00',
      start_date: '2026-11-18',
    }),
  )
  expect(root.textContent).toContain('Custom notification saved')
  expect(root.querySelector('a[href*="calendar.google"]')).not.toBeNull()
  expect(root.querySelector('form')).toBeNull()
})
it('retains input on save failure and does not show a calendar event or success', async () => {
  api.add.mockRejectedValueOnce(new Error('Choose a future time.'))
  await mount()
  await click('Add custom notification')
  await input('Name', 'Try again')
  await submit()
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('Choose a future time.')
  expect(field('Name').value).toBe('Try again')
  expect(root.querySelector('a')).toBeNull()
  await submit()
  expect(api.add).toHaveBeenCalledTimes(2)
})
it('asks before deletion, preserves the list on failure, and reports a suppressed test honestly', async () => {
  api.list.mockResolvedValue({ success: true, reminders: [reminder], scheduler_ready: true })
  api.remove.mockRejectedValueOnce(new Error('Could not delete'))
  api.test.mockResolvedValue(false)
  await mount()
  await click('Send test')
  expect(root.textContent).toContain('Test not queued')
  await click('Delete')
  expect(api.remove).not.toHaveBeenCalled()
  await click('Confirm delete')
  expect(root.textContent).toContain('Could not delete')
  expect(root.textContent).toContain('Evening check-in')
})
it('does not show stale save results or calendar links after a session transition', async () => {
  let resolve!: (value: Reminder) => void
  api.add.mockReturnValue(
    new Promise<Reminder>((done) => {
      resolve = done
    }),
  )
  await mount()
  await click('Add custom notification')
  await input('Name', 'Old account')
  await act(async () => root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  await submit()
  advanceSessionGeneration()
  await act(async () => resolve(reminder))
  await flush()
  expect(root.textContent).not.toContain('Custom notification saved')
  expect(root.querySelector('a[href*="calendar.google"]')).toBeNull()
})
it('shows scheduler unavailability and permits retry after list failure', async () => {
  api.list.mockRejectedValueOnce(new Error('offline'))
  await mount()
  expect(button('Add custom notification').disabled).toBe(true)
  api.list.mockResolvedValue({ success: true, reminders: [], scheduler_ready: false })
  await click('Retry')
  expect(root.textContent).toContain('Reminder delivery is unavailable')
})
