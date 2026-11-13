// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Footer } from './Footer'

vi.mock('../state/auth', () => ({
  ensureStatusLoaded: vi.fn(),
  officialFeedEnabled: { value: false },
}))
vi.mock('../state/api/blogUrls', () => ({ officialFeedPath: '/blog' }))

let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  vi.unstubAllEnvs()
})

test('keeps the existing links without representing other self-hosters as Foghouse', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', undefined)
  act(() => render(<Footer />, container))
  expect(container.querySelector('a[href="/privacy"]')?.textContent).toBe('Privacy')
  expect(container.querySelector('a[href="/terms"]')).not.toBeNull()
  expect(container.querySelector('a[href="/foghouse-privacy"]')).toBeNull()
})

test('adds the exact Foghouse Privacy label adjacent to the existing Privacy link', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', 'true')
  act(() => render(<Footer tagline="Welcome" />, container))
  const links = Array.from(container.querySelectorAll('a'))
  const index = links.findIndex((link) => link.getAttribute('href') === '/privacy')
  expect(links[index + 1].textContent).toBe('Foghouse Privacy')
  expect(links[index + 1].getAttribute('href')).toBe('/foghouse-privacy')
  expect(container.querySelector('.site-footer-with-tagline')).not.toBeNull()
  expect(container.textContent).toContain('Welcome')
})

test('requires an explicit true opt-in', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', 'false')
  act(() => render(<Footer />, container))
  expect(container.querySelector('a[href="/foghouse-privacy"]')).toBeNull()
})
