// @vitest-environment jsdom
vi.mock('../../state/auth', () => ({ auth: { value: { token: 'test' } } }))
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CPAPImport } from './index'
const api = vi.hoisted(() => ({
  bulkAddMetrics: vi.fn(),
  fetchCustomMetrics: vi.fn().mockResolvedValue([]),
  addCustomMetric: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../state/api', () => api)
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  api.bulkAddMetrics.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <CPAPImport />
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
async function selectFile() {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', {
    value: [
      {
        name: 'SLEEP_RECORD.csv',
        text: async () =>
          'SESSION_DATE,USAGE_HOURS,AHI,LEAK_95_PERCENTILE,SLEEP_SCORE,DATA_UPDATE_TIME,RECORD_DELETE_IND\n2026-10-19,8,1,0,90,2026-10-20 11:32:41,N',
      },
    ],
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
async function save() {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('.cpap-preview button')!.click()
    await new Promise((resolve) => setTimeout(resolve, 15))
  })
}
it('does not celebrate preview, then celebrates a complete saved upload', async () => {
  api.bulkAddMetrics.mockImplementation(async ({ data }) => ({ success: true, inserted: data.length }))
  await selectFile()
  expect(container.querySelector('.celebration-overlay')).toBeNull()
  await save()
  expect(container.querySelector('.celebration-cpap')).not.toBeNull()
})
it.each(['failure', 'partial'])('does not celebrate %s', async (mode) => {
  if (mode === 'failure') api.bulkAddMetrics.mockRejectedValue(new Error('Save failed'))
  else api.bulkAddMetrics.mockResolvedValue({ success: true, inserted: 1 })
  await selectFile()
  await save()
  expect(container.querySelector('.celebration-overlay')).toBeNull()
  expect(container.textContent).toContain('confirmed saved')
})
