// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ActivityWatchStatus } from './ActivityWatchStatus'
vi.mock('axios', () => ({ default: { get: vi.fn() } }))
vi.mock('../state/auth', () => ({ auth: { value: { token: 'synthetic' } } }))
vi.mock('../config', () => ({ API_URL: '/api' }))
let root: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  render(null, root)
  root.remove()
  client.clear()
})
const show = async () => {
  await act(async () =>
    render(
      <QueryClientProvider client={client}>
        <ActivityWatchStatus mobile={true} />
      </QueryClientProvider>,
      root,
    ),
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}
test('shows persisted old history and source device instead of relying on recent events', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: {
      success: true,
      devices: [
        {
          device_name: 'pixel_9_pro',
          is_mobile: true,
          events_total: 1201,
          earliest_event: '2025-01-01T00:00:00Z',
          latest_event: '2025-01-31T00:00:00Z',
          last_received: '2026-11-26T12:00:00Z',
        },
      ],
    },
  })
  await show()
  expect(root.textContent).toContain('pixel_9_pro')
  expect(root.textContent).toContain('1,201 stored events')
  expect(root.textContent).toContain('2025-01-01')
})
test('a failed status read is not reported as not configured', async () => {
  vi.mocked(axios.get).mockRejectedValue(new Error('offline'))
  await show()
  expect(root.querySelector('[role=alert]')?.textContent).toContain('Could not check ActivityWatch status')
})
