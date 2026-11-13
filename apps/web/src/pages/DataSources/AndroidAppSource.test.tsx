import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, it, vi } from 'vitest'

import { AndroidAppSource } from './AndroidAppSource'
const count = vi.hoisted(() => vi.fn().mockResolvedValue(0))
vi.mock('../../state/api', () => ({ fetchRawRecordCount: count }))
vi.mock('../../state/auth', () => ({ auth: { value: { token: 'test-only' } } }))
it('checks Health Connect provenance and explains the private server setup', async () => {
  const root = document.createElement('div')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <AndroidAppSource />
        </QueryClientProvider>,
        root,
      )
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
    expect(count).toHaveBeenCalledWith({ source: 'health_connect' })
    expect(root.textContent).toContain('Waiting for first Health Connect data')
    expect(root.textContent).toContain('https://stats.foghouse.org')
    expect(root.textContent).toContain('Sync Now')
    expect(root.textContent).toContain('battery exemption')
    expect(root.textContent).not.toContain('Data detected in the last 7 days')
  } finally {
    act(() => render(null, root))
    client.clear()
  }
})
