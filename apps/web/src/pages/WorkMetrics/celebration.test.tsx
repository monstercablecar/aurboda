// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'

import { WorkMetrics } from './index'
import { createWorkTemplate } from './onboarding'
const api = vi.hoisted(() => ({
  addCustomMetric: vi.fn(),
  addActivityTypeDefinition: vi.fn(),
  fetchBucketedMetrics: vi.fn(),
  fetchActivityTypeDefinitions: vi.fn(),
  fetchActivities: vi.fn(),
  fetchComments: vi.fn(),
  fetchCustomMetrics: vi.fn(),
  fetchUserSettings: vi.fn(),
  updateUserSettings: vi.fn(),
}))
const save = vi.hoisted(() => vi.fn())
vi.mock('../../state/api', () => api)
vi.mock('../../state/api/work', () => ({ saveWorkDay: save }))
vi.mock('../../state/auth', () => ({ auth: { value: { token: 'test', user: 'test' } } }))
let root: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.resetAllMocks()
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  api.fetchBucketedMetrics.mockResolvedValue({ buckets: [] })
  api.fetchActivities.mockResolvedValue([])
  api.fetchComments.mockResolvedValue([])
  api.fetchCustomMetrics.mockResolvedValue([])
  api.fetchActivityTypeDefinitions.mockResolvedValue([])
  api.fetchUserSettings.mockResolvedValue({ work: createWorkTemplate('productivity') })
  save.mockResolvedValue({})
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
  vi.unstubAllGlobals()
})
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
}
async function mount() {
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <WorkMetrics />
      </QueryClientProvider>,
      root,
    ),
  )
  for (let n = 0; n < 4; n++) await settle()
}
async function clickSave() {
  act(() => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save workday')!.click())
  await settle()
  await settle()
}
test('new successful day celebrates once even if refreshed data remains empty', async () => {
  await mount()
  await clickSave()
  expect(root.querySelector('.celebration-workday')).not.toBeNull()
  act(() => root.querySelector<HTMLButtonElement>('.celebration-dismiss')!.click())
  await clickSave()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
test('existing metrics and failed saves do not celebrate', async () => {
  api.fetchBucketedMetrics.mockResolvedValue({
    buckets: [{ start: new Date().toISOString(), metrics: { existing: { avg: 1, sum: 1 } } }],
  })
  await mount()
  await clickSave()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  save.mockRejectedValue(new Error('Save failed'))
  await clickSave()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  expect(root.textContent).toContain('Save failed')
})
test('changing selected day while saving does not show the old day celebration', async () => {
  let resolveSave: () => void = () => {}
  save.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve
      }),
  )
  await mount()
  act(() => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save workday')!.click())
  act(() => {
    const input = root.querySelector<HTMLInputElement>('input[type=date]')!
    input.value = '2026-01-02'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
  await act(async () => resolveSave())
  await settle()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
