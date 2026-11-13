// @vitest-environment jsdom
import { signal } from '@preact/signals'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

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

function ShellIdentity() {
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

test('shell retains Aurboda across login, private and public navigation, and logout', () => {
  for (const [url, signedIn] of [
    ['/login', false],
    ['/people', true],
    ['/u/person', true],
  ] as const) {
    show(url, signedIn)
    expect(container.querySelectorAll('a[aria-label="Aurboda home"]')).toHaveLength(2)
    expect(container.querySelector('.nav-mobile-brand img')?.getAttribute('src')).toBe('/logo.svg')
    expect(container.querySelector('.sidebar-brand')?.textContent).toBe('Aurboda')
    expect(container.querySelector('.sidebar-brand img')).toBeNull()
  }
  show('/people', true)
  expect(container.querySelector('.sidebar-nav a[href="/people"]')).not.toBeNull()
  const logout = container.querySelector<HTMLAnchorElement>('.sidebar-footer a[href="#"]')
  if (!logout) throw new Error('Missing logout link')
  act(() => logout.click())
  expect(container.querySelectorAll('a[aria-label="Aurboda home"]')).toHaveLength(2)
  expect(container.querySelector('.nav-mobile-brand img')?.getAttribute('src')).toBe('/logo.svg')
  expect(container.querySelector('.sidebar-nav a[href="/people"]')).toBeNull()
  expect(container.querySelector('.sidebar-nav a[href="/login"]')).not.toBeNull()
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
