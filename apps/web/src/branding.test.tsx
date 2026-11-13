// @vitest-environment jsdom
import { signal } from '@preact/signals'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { appContentClass, brandForRoute, useBrandTitle } from './branding'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { auth } from './state/auth'

let currentUrl = '/people'
vi.mock('preact-iso', () => ({ useLocation: () => ({ url: currentUrl }) }))
vi.mock('./components/usePageVisibility', () => ({ usePageVisibility: () => () => true }))
vi.mock('./state/auth', () => ({
  auth: signal<{ token?: string; user?: string; is_admin?: boolean }>({}),
  ensureStatusLoaded: vi.fn(),
  logout: () => {
    auth.value = {}
  },
  signupMode: signal('open'),
}))

const container = document.createElement('div')
beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  })
})
afterEach(() => {
  act(() => render(null, container))
  vi.unstubAllGlobals()
  auth.value = {}
})

test.each([
  '/login',
  '/signup',
  '/privacy',
  '/terms',
  '/blog',
  '/challenges/join',
  '/u',
  '/u/person',
  '/u/person/posts/1',
])('public route %s retains Aurboda with or without a session', (path) => {
  for (const signedIn of [true, false]) {
    expect(brandForRoute(`${path}/?next=/people#section`, signedIn).name).toBe('Aurboda')
  }
})

test.each(['/', '/people', '/work', '/resources', '/timeline', '/settings'])(
  'private route %s requires a session to show The Foghouse',
  (path) => {
    expect(brandForRoute(path, true).name).toBe('The Foghouse')
    expect(brandForRoute(path, false).name).toBe('Aurboda')
  },
)

test('dark content scope is exclusive to login', () => {
  expect(appContentClass('/login/?next=/people')).toBe('app-content login-theme')
  for (const path of ['/', '/signup', '/people', '/login-other', '/u/login']) {
    expect(appContentClass(path)).toBe('app-content')
  }
})

function ShellIdentity() {
  useBrandTitle(currentUrl, Boolean(auth.value.token))
  return (
    <>
      <Header />
      <Sidebar />
    </>
  )
}

function show(url: string, signedIn: boolean) {
  currentUrl = url
  act(() => {
    auth.value = signedIn ? { token: 'test-token', user: 'test-user' } : {}
    render(<ShellIdentity />, container)
  })
}

test('shell identity and title restore on public navigation and logout', () => {
  show('/people', true)
  expect(document.title).toBe('The Foghouse')
  expect(container.querySelectorAll('a[aria-label="The Foghouse home"]')).toHaveLength(2)
  expect(container.querySelectorAll('img[src="/foghouse-mark.png"]')).toHaveLength(2)
  show('/u/person', true)
  expect(document.title).toBe('Aurboda')
  expect(container.querySelectorAll('a[aria-label="Aurboda home"]')).toHaveLength(2)
  expect(container.querySelector('img[src="/foghouse-mark.png"]')).toBeNull()
  show('/people', true)
  const logout = container.querySelector<HTMLAnchorElement>('.sidebar-footer a[href="#"]')
  if (!logout) throw new Error('Missing logout link')
  act(() => logout.click())
  expect(document.title).toBe('Aurboda')
  expect(container.querySelectorAll('a[aria-label="Aurboda home"]')).toHaveLength(2)
})

test('sidebar collapse still toggles without changing navigation', () => {
  show('/people', true)
  const links = [...container.querySelectorAll('.sidebar-nav a')].map((link) => link.getAttribute('href'))
  act(() => container.querySelector<HTMLButtonElement>('.sidebar-toggle')?.click())
  expect(container.querySelector('.sidebar.collapsed')).not.toBeNull()
  expect(container.querySelector('.sidebar-toggle')?.getAttribute('title')).toBe('Expand sidebar')
  expect([...container.querySelectorAll('.sidebar-nav a')].map((link) => link.getAttribute('href'))).toEqual([
    ...links,
    '/data-sources',
  ])
})
