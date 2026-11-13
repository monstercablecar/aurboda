import { signal } from '@preact/signals'
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { advanceSessionGeneration } from '../state/sessionBoundary'
import { FeatureControl } from './FeatureControl'
import { Header } from './Header'
import { NAV_LINKS_PRIMARY } from './nav-links'
import { Sidebar } from './Sidebar'

const api = vi.hoisted(() => ({ fetchUserSettings: vi.fn(), updateUserSettings: vi.fn() }))
vi.mock('../state/api', () => api)
vi.mock('../state/auth', () => ({
  auth: signal({ token: 'test', user: 'test', is_admin: true }),
  signupMode: signal('open'),
  ensureStatusLoaded: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('preact-iso', () => ({ useLocation: () => ({ url: '/work' }) }))
let root: HTMLDivElement
let client: QueryClient
let settings: { hidden_pages: string[] }
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
}
const mount = async (menus = false) => {
  await act(async () =>
    render(
      <QueryClientProvider client={client}>
        <FeatureControl />
        {menus && (
          <>
            <Header />
            <Sidebar />
          </>
        )}
      </QueryClientProvider>,
      root,
    ),
  )
  await flush()
}
const toggle = async (label: string) => {
  await act(async () => root.querySelector<HTMLInputElement>(`input[aria-label="Show ${label}"]`)?.click())
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  settings = { hidden_pages: ['/future-page'] }
  api.fetchUserSettings.mockImplementation(async () => settings)
  api.updateUserSettings.mockImplementation(async (update) => {
    settings = { ...settings, ...update }
    return { ...settings, success: true }
  })
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
  vi.unstubAllGlobals()
})
it('saves only visibility preferences, preserves future pages and updates both menus immediately', async () => {
  await mount(true)
  expect(root.querySelector('.sidebar a[href="/work"]')).not.toBeNull()
  expect(root.querySelector('.nav-drawer a[href="/work"]')).not.toBeNull()
  await toggle('Work')
  expect(api.updateUserSettings).toHaveBeenLastCalledWith({ hidden_pages: ['/future-page', '/work'] })
  expect(root.querySelector('.sidebar a[href="/work"]')).toBeNull()
  expect(root.querySelector('.nav-drawer a[href="/work"]')).toBeNull()
  expect(root.textContent).toContain('Saved')
  await toggle('Work')
  expect(root.querySelector('.sidebar a[href="/work"]')).not.toBeNull()
  expect(root.querySelector('.nav-drawer a[href="/work"]')).not.toBeNull()
  expect(root.querySelector<HTMLInputElement>('input[aria-label="Show Settings"]')?.disabled).toBe(true)
})
it('retains visibility on save failure and supports a retry', async () => {
  api.updateUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount(true)
  await toggle('Work')
  expect(root.textContent).toContain('Could not save')
  expect(root.querySelector('.sidebar a[href="/work"]')).not.toBeNull()
  expect(root.querySelector<HTMLInputElement>('input[aria-label="Show Work"]')?.checked).toBe(true)
  await toggle('Work')
  expect(root.querySelector('.sidebar a[href="/work"]')).toBeNull()
})
it('hides empty groups and filters collapsed navigation, while Settings remains reachable', async () => {
  settings.hidden_pages = [
    '/settings',
    '/help',
    '/admin',
    '/feed',
    '/dashboards',
    '/challenges',
    '/data-sources',
    '/data-sources/aurboda',
    '/data-sources/android-app',
    '/data-sources/oura',
    '/data-sources/garmin',
    '/data-sources/strava',
    '/data-sources/activitywatch-desktop',
    '/data-sources/activitywatch-android',
    '/data-sources/rescue-time',
    '/data-sources/lastfm',
    '/data-sources/owntracks',
    '/data-sources/calendars',
  ]
  await mount(true)
  expect(root.querySelector('.sidebar a[href="/settings"]')).not.toBeNull()
  expect(root.querySelector('.sidebar a[href="/help"]')).toBeNull()
  expect(root.querySelector('.sidebar a[href="/admin"]')).toBeNull()
  expect(root.querySelector('.sidebar-section-btn')).toBeNull()
  expect(root.querySelector('.drawer-section-toggle')).toBeNull()
  await act(async () => root.querySelector<HTMLButtonElement>('.sidebar-toggle')?.click())
  expect(root.querySelector('.sidebar a[href="/data-sources"]')).toBeNull()
  expect(root.querySelector('.sidebar a[href="/settings"]')).not.toBeNull()
})
it('keeps individual data-source children usable when the overview is hidden', async () => {
  settings.hidden_pages = ['/data-sources']
  await mount(true)
  await act(async () => root.querySelector<HTMLButtonElement>('.sidebar-toggle')?.click())
  expect(root.querySelector('.sidebar a[href="/data-sources"]')).toBeNull()
  expect(root.querySelector('.sidebar a[href="/data-sources/aurboda"]')).not.toBeNull()
})
it('does not apply a pending old-account save after session changes', async () => {
  let resolve!: (value: unknown) => void
  api.updateUserSettings.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await mount()
  await toggle('Work')
  expect(root.querySelector<HTMLInputElement>('input[aria-label="Show Tasks"]')?.disabled).toBe(true)
  advanceSessionGeneration()
  await act(async () => resolve({ hidden_pages: ['/work'] }))
  await flush()
  expect(client.getQueryData(['userSettings'])).toEqual(settings)
  expect(root.textContent).not.toContain('Saved')
})
it('offers a retry when preferences fail to load', async () => {
  api.fetchUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount()
  expect(root.textContent).toContain('Could not load')
  await act(async () => root.querySelector<HTMLButtonElement>('.feature-control button')?.click())
  await flush()
  expect(root.querySelector('input[aria-label="Show Work"]')).not.toBeNull()
})

it('does not cache an unsuccessful settings response', async () => {
  api.updateUserSettings.mockResolvedValueOnce({ success: false, hidden_pages: ['/work'] })
  await mount(true)
  await toggle('Work')
  expect(root.textContent).toContain('Could not save')
  expect(root.querySelector('.sidebar a[href="/work"]')).not.toBeNull()
})

it('renders a usable switch for a newly registered page without a description', async () => {
  NAV_LINKS_PRIMARY.push({ href: '/future-test-page', label: 'Future test page' })
  try {
    await mount()
    expect(root.querySelector('input[aria-label="Show Future test page"]')).not.toBeNull()
    await toggle('Future test page')
    expect(api.updateUserSettings).toHaveBeenLastCalledWith({
      hidden_pages: ['/future-page', '/future-test-page'],
    })
  } finally {
    NAV_LINKS_PRIMARY.pop()
  }
})
