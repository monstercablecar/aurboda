// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, test, vi } from 'vitest'

import { InsightsView } from './InsightsView'
const fetchInsights = vi.hoisted(() => vi.fn())
vi.mock('../../state/api', () => ({
  fetchPharmacologyInsights: fetchInsights,
  downloadPharmacologyCsv: vi.fn(),
  downloadPharmacologyJson: vi.fn(),
  pharmacologyErrorMessage: (e: Error) => e?.message ?? 'No data',
}))
let container: HTMLDivElement
let client: QueryClient
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  client.clear()
  vi.clearAllMocks()
})
test('keeps date controls available after failure and rejects reversed ranges without fetching', async () => {
  fetchInsights.mockRejectedValue(new Error('Unavailable'))
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <InsightsView timezone="America/Denver" notify={() => {}} />
      </QueryClientProvider>,
      container,
    ),
  )
  await flush()
  await flush()
  expect(container.textContent).toContain('Insights could not load')
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]')
  expect(inputs).toHaveLength(2)
  const calls = fetchInsights.mock.calls.length
  act(() => {
    inputs[0].value = '2099-01-01'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
  })
  await flush()
  expect(container.textContent).toContain('Choose both dates')
  expect(fetchInsights).toHaveBeenCalledTimes(calls)
  expect(container.querySelectorAll('input[type="date"]')).toHaveLength(2)
})
