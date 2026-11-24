import type { FamilyAccess } from '@aurboda/api-spec'

import { signal } from '@preact/signals'
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { auth } from '../state/auth'
import { advanceSessionGeneration } from '../state/sessionBoundary'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

const api = vi.hoisted(() => ({ fetchUserSettings: vi.fn(), updateUserSettings: vi.fn() }))
vi.mock('../state/api', () => api)
let familyAccess: FamilyAccess
vi.mock('../state/api/family-photos', () => ({ useFamilyAccess: () => ({ data: familyAccess }) }))
vi.mock('../state/auth', () => ({
  auth: signal({ token: 'test', user: 'test', is_admin: true }),
  signupMode: signal('open'),
  ensureStatusLoaded: vi.fn(),
  logout: vi.fn(),
}))
let currentUrl = '/work'
vi.mock('preact-iso', () => ({ useLocation: () => ({ url: currentUrl }) }))
let root: HTMLDivElement
let client: QueryClient
let settings: { hidden_pages: string[]; sidebar_order: string[] }
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
}
const mount = async () => {
  await act(async () =>
    render(
      <QueryClientProvider client={client}>
        <Header />
        <Sidebar />
      </QueryClientProvider>,
      root,
    ),
  )
  await flush()
}
const click = async (selector: string) => {
  await act(async () => root.querySelector<HTMLElement>(selector)?.click())
  await flush()
}
const edit = () => click('.sidebar input[aria-label="Reorganize"]')
const orderedKeys = (selector = '.sidebar') =>
  [...root.querySelectorAll(`${selector} [data-sidebar-key]`)].map((element) =>
    element.getAttribute('data-sidebar-key'),
  )
beforeEach(() => {
  vi.clearAllMocks()
  currentUrl = '/work'
  auth.value = { ...auth.value, token: 'test', is_admin: true }
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  familyAccess = {
    enabled: true,
    allowed: false,
    is_admin: false,
    originals_enabled: false,
    max_upload_bytes: 1024,
  }
  settings = { hidden_pages: ['/work', '/future-page'], sidebar_order: ['/future-order', '/admin'] }
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

it('places Reorganize immediately above Logout and restores hidden pages in edit mode', async () => {
  await mount()
  const control = root.querySelector('.sidebar .sidebar-reorganize')!
  expect(control.nextElementSibling?.textContent).toContain('Logout')
  expect(root.querySelector('.sidebar input[aria-label="Show Work"]')).toBeNull()
  expect(root.querySelector('.sidebar a[href="/work"]')).toBeNull()
  await edit()
  expect(root.querySelector('.sidebar a[href="/work"]')).not.toBeNull()
  expect(root.querySelector<HTMLInputElement>('.sidebar input[aria-label="Show Work"]')?.checked).toBe(false)
  expect(root.querySelector<HTMLInputElement>('.sidebar input[aria-label="Show Settings"]')?.disabled).toBe(
    true,
  )
  expect(root.querySelector('.sidebar input[aria-label="Show Family Photos"]')).toBeNull()
  await click('.sidebar input[aria-label="Show Work"]')
  expect(api.updateUserSettings).toHaveBeenLastCalledWith({ hidden_pages: ['/future-page'] })
  await edit()
  expect(root.querySelector('.sidebar a[href="/work"]')).not.toBeNull()
})
it('moves whole groups through keyboard controls, updates mobile and retains unknown keys', async () => {
  await mount()
  await edit()
  expect(root.querySelector('.sidebar button[aria-label="Move Feed"]')).toBeNull()
  expect(root.querySelector('.sidebar button[aria-label="Move Oura Ring"]')).toBeNull()
  const before = orderedKeys()
  await click('.sidebar button[aria-label="Move Sharing up"]')
  const after = orderedKeys()
  expect(after.indexOf('group:sharing')).toBe(before.indexOf('group:sharing') - 1)
  expect(orderedKeys('.nav-drawer').indexOf('group:sharing')).toBe(
    after.filter((key) => key !== '/work').indexOf('group:sharing'),
  )
  expect(settings.sidebar_order).toContain('/future-order')
  expect(
    root.querySelectorAll('.sidebar [data-sidebar-key="group:sharing"] .sidebar-sub-links input'),
  ).toHaveLength(3)
  const handle = root.querySelector<HTMLButtonElement>('.sidebar button[aria-label="Move Sharing"]')!
  await act(() => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  })
  await flush()
  expect(orderedKeys()).toEqual(before)
})
it('keeps saved order and switches unchanged on unsuccessful saves, then retries', async () => {
  await mount()
  await edit()
  const before = orderedKeys()
  api.updateUserSettings.mockResolvedValueOnce({ success: false })
  await click('.sidebar button[aria-label="Move Sharing up"]')
  expect(orderedKeys()).toEqual(before)
  expect(root.querySelector('.sidebar [role="alert"]')?.textContent).toContain('Could not save')
  api.updateUserSettings.mockRejectedValueOnce(new Error('offline'))
  await click('.sidebar input[aria-label="Show Work"]')
  expect(root.querySelector<HTMLInputElement>('.sidebar input[aria-label="Show Work"]')?.checked).toBe(false)
  await click('.sidebar button[aria-label="Move Sharing up"]')
  expect(orderedKeys()).not.toEqual(before)
})
it('serializes rapid changes and fences a pending order save after account switches', async () => {
  let resolve!: (value: unknown) => void
  api.updateUserSettings.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await mount()
  await edit()
  const before = settings
  await click('.sidebar button[aria-label="Move Sharing up"]')
  await click('.sidebar input[aria-label="Show Work"]')
  await click('.sidebar button[aria-label="Move Sharing down"]')
  expect(api.updateUserSettings).toHaveBeenCalledTimes(1)
  advanceSessionGeneration()
  await act(async () => {
    auth.value = { ...auth.value, token: 'other' }
    resolve({ success: true, hidden_pages: [], sidebar_order: ['group:sharing'] })
  })
  await flush()
  expect(client.getQueryData(['userSettings'])).toEqual(before)
  expect(root.querySelector<HTMLInputElement>('.sidebar input[aria-label="Reorganize"]')?.checked).toBe(false)
})
it('recovers preferences after a load failure and keeps Settings when every optional page is hidden', async () => {
  api.fetchUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await edit()
  expect(root.querySelector('.sidebar [role="alert"]')?.textContent).toContain('Could not load')
  await click('.sidebar .sidebar-edit-help button')
  expect(root.querySelector<HTMLInputElement>('.sidebar input[aria-label="Show Work"]')?.disabled).toBe(false)
})
it('allows mobile editing and preserves hidden family access checks', async () => {
  familyAccess = { ...familyAccess, allowed: true }
  settings.hidden_pages.push('/family-photos')
  await mount()
  await click('.nav-drawer input[aria-label="Reorganize"]')
  expect(root.querySelector('.nav-drawer input[aria-label="Show Family Photos"]')).not.toBeNull()
  await click('.nav-drawer input[aria-label="Show Family Photos"]')
  expect(root.querySelector('.sidebar a[href="/family-photos"]')).not.toBeNull()
})

it('cancels an older preference read before applying a saved reorder', async () => {
  await mount()
  await edit()
  let resolve!: (value: unknown) => void
  const oldRead = client
    .fetchQuery({
      queryKey: ['userSettings'],
      queryFn: () =>
        new Promise((done) => {
          resolve = done
        }),
    })
    .catch(() => undefined)
  await click('.sidebar button[aria-label="Move Sharing up"]')
  const saved = [...settings.sidebar_order]
  resolve({ success: true, hidden_pages: ['/work'], sidebar_order: [] })
  await oldRead
  await flush()
  expect(client.getQueryData<{ sidebar_order: string[] }>(['userSettings'])?.sidebar_order).toEqual(saved)
})
it('fences an in-flight visibility save on logout and lets a subsequent session edit', async () => {
  let resolve!: (value: unknown) => void
  await mount()
  await edit()
  api.updateUserSettings.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await click('.sidebar input[aria-label="Show Work"]')
  advanceSessionGeneration()
  await act(() => {
    auth.value = {}
  })
  const before = client.getQueryData(['userSettings'])
  resolve({ success: true, hidden_pages: [], sidebar_order: [] })
  await flush()
  expect(client.getQueryData(['userSettings'])).toEqual(before)
  await act(() => {
    auth.value = { token: 'new-session', user: 'test', is_admin: true }
  })
  await flush()
  await edit()
  await click('.sidebar input[aria-label="Show Work"]')
  expect(api.updateUserSettings).toHaveBeenCalledTimes(2)
  expect(root.querySelector<HTMLInputElement>('.sidebar input[aria-label="Show Work"]')?.checked).toBe(true)
})

it('keeps the Data Sources icon, label and group active state when its overview is hidden and sidebar collapsed', async () => {
  settings.hidden_pages = ['/data-sources']
  currentUrl = '/data-sources/oura/history'
  await mount()
  await click('.sidebar-toggle')
  const link = root.querySelector<HTMLAnchorElement>('.sidebar [data-sidebar-key="group:data-sources"] a')
  expect(link?.getAttribute('href')).toBe('/data-sources/aurboda')
  expect(link?.querySelector('.sidebar-icon')?.textContent).toBe('📡')
  expect(link?.querySelector('.sidebar-label')?.textContent).toBe('Data Sources')
  expect(link?.title).toBe('Data Sources')
  expect(link?.classList.contains('active')).toBe(true)
})

it('cancels a preference read started during PATCH before publishing the saved reorder', async () => {
  await mount()
  await edit()
  let resolveSave!: (value: unknown) => void
  let resolveRead!: (value: unknown) => void
  api.updateUserSettings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve
      }),
  )
  await click('.sidebar button[aria-label="Move Sharing up"]')
  const stale = structuredClone(settings)
  const lateRead = client
    .fetchQuery({
      queryKey: ['userSettings'],
      queryFn: () =>
        new Promise((resolve) => {
          resolveRead = resolve
        }),
    })
    .catch(() => undefined)
  const saved = { ...settings, ...api.updateUserSettings.mock.calls.at(-1)?.[0], success: true }
  await act(async () => {
    resolveSave(saved)
  })
  await flush()
  resolveRead(stale)
  await lateRead
  await flush()
  expect(client.getQueryData(['userSettings'])).toEqual(saved)
  expect(orderedKeys()).toEqual(saved.sidebar_order.filter((key: string) => key !== '/future-order'))
  expect(root.querySelector('.sidebar [role="status"]')?.textContent).toBe('Saved')
})
