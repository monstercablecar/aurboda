// @vitest-environment jsdom
import type { TodayResponse } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ConfirmRegimen } from './ConfirmRegimen'
const confirm = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('../../state/api', () => ({
  confirmRegimen: confirm,
  pharmacologyErrorMessage: (error: Error) => error.message,
}))
type Due = TodayResponse['data']['due_regimens'][number]
const due = (): Due => ({
  state: 'pending',
  confirmed_item_ids: [],
  incomplete_item_ids: [],
  regimen: {
    id: 'stack',
    name: 'Morning',
    items: [
      { id: 'one', dose: 100, dose_unit: 'mg', paused: false, substance: { display_name: 'One' } },
      { id: 'two', dose: 200, dose_unit: 'mg', paused: false, substance: { display_name: 'Two' } },
      { id: 'paused', dose: 300, dose_unit: 'mg', paused: true, substance: { display_name: 'Paused' } },
    ],
  } as Due['regimen'],
})
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T02:00:00Z'))
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, container))
  client.clear()
  container.remove()
  vi.useRealTimers()
})
const mount = (date: string, entry = due()) =>
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <ConfirmRegimen
          date={date}
          due={entry}
          timezone="America/Denver"
          onCancel={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
      container,
    ),
  )
const time = () => {
  const input = container.querySelector<HTMLInputElement>('input[type="datetime-local"]')
  if (!input) throw new Error('Missing actual time input')
  return input
}
const submit = async () => {
  await act(async () => {
    const form = container.querySelector('form')
    if (!form) throw new Error('Missing confirmation form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
test('historical confirmation requires explicit actual time and sends that time', async () => {
  mount('2026-11-11')
  expect(time().value).toBe('')
  expect(time().required).toBe(true)
  await submit()
  expect(confirm).not.toHaveBeenCalled()
  act(() => {
    time().value = '2026-11-11T08:15'
    time().dispatchEvent(new Event('input', { bubbles: true }))
  })
  await submit()
  expect(confirm).toHaveBeenCalledWith(
    'stack',
    expect.objectContaining({ administered_at: new Date('2026-11-11T08:15').toISOString() }),
  )
})
test('past-due items today also require explicit actual time', () => {
  mount('2026-11-12', { ...due(), incomplete_item_ids: ['one'] })
  expect(time().value).toBe('')
})
test('nonhistorical entry uses selected timezone day', () => {
  mount('2026-11-12')
  expect(time().value).not.toBe('')
})
test('finishing excludes already recorded and paused items', async () => {
  mount('2026-11-12', { ...due(), state: 'partial', confirmed_item_ids: ['one'] })
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
  expect(container.textContent).not.toContain('Paused')
  await submit()
  expect(confirm).toHaveBeenCalledWith(
    'stack',
    expect.objectContaining({ items: [expect.objectContaining({ item_id: 'two' })] }),
  )
})

test('does not copy one item schedule onto a stack with different scheduled times', async () => {
  const entry = due()
  entry.regimen.items[0].scheduled_local_time = '08:00'
  entry.regimen.items[1].scheduled_local_time = '18:00'
  mount('2026-11-12', entry)
  await submit()
  expect(confirm).toHaveBeenCalled()
  expect(confirm.mock.calls[0][1]).not.toHaveProperty('scheduled_at')
})
