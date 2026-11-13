// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'

import { ImportPanel } from './ImportPanel'
const api = vi.hoisted(() => ({
  listImportJobsApi: vi.fn(),
  getImportJobApi: vi.fn(),
  startLivsmedelsverketImportApi: vi.fn(),
}))
vi.mock('../state/api', () => api)
let root: HTMLDivElement
let client: QueryClient
const job = (id: string, status = 'completed', processed_items = 3, skipped_items = 0) => ({
  id,
  status,
  processed_items,
  skipped_items,
})
beforeEach(() => {
  vi.resetAllMocks()
  api.listImportJobsApi.mockResolvedValue([job('historical')])
  api.startLivsmedelsverketImportApi.mockResolvedValue(job('ours', 'pending', 0))
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
})
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
async function mount() {
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <ImportPanel />
      </QueryClientProvider>,
      root,
    ),
  )
  await settle()
}
test('historical job is silent; own completed job celebrates only once', async () => {
  api.getImportJobApi.mockResolvedValue(job('ours'))
  await mount()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  act(() => root.querySelector('button')!.click())
  await settle()
  await settle()
  expect(root.querySelector('.celebration-import')).not.toBeNull()
  act(() => root.querySelector<HTMLButtonElement>('.celebration-dismiss')!.click())
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['importJobs'] })
  })
  await settle()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
test.each([
  job('other'),
  job('ours', 'completed', 0),
  job('ours', 'completed', 4, 1),
  job('ours', 'failed', 4),
  job('ours', 'running', 4),
])('does not celebrate unmatched, empty, partial, failed or running job %o', async (result) => {
  api.getImportJobApi.mockResolvedValue(result)
  await mount()
  act(() => root.querySelector('button')!.click())
  await settle()
  await settle()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
