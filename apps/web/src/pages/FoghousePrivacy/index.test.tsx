// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Privacy } from '../Privacy'
import { FoghousePrivacy } from './index'

vi.mock('../../components/AdminContact', () => ({ StaticPageContact: () => null }))

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

test('direct route makes no Foghouse policy promises without opt-in', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', undefined)
  act(() => render(<FoghousePrivacy />, container))
  expect(container.querySelector('h1')?.textContent).toBe('Instance privacy policy')
  expect(container.textContent).not.toContain('The Foghouse administrator can access stored data')
  expect(container.querySelector('a[href="/privacy"]')).not.toBeNull()
})

test('enabled policy discloses support limits, third parties, backup limits and pending facts', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', 'true')
  act(() => render(<FoghousePrivacy />, container))
  const text = container.textContent?.replaceAll(/\s+/g, ' ')
  expect(container.querySelector('h1')?.textContent).toBe('Foghouse Privacy')
  expect(text).toContain('not accessible to other ordinary users')
  expect(text).toContain('only to confirm or investigate bugs, or to perform actions you authorize')
  expect(text).toContain('cannot recall information already retrieved')
  expect(text).toContain('no in-app upload restore')
  expect(text).toContain('Journal round-trip restore tests have not run')
  expect(text).toContain('original attachment bytes')
  expect(text).toContain('immutable snapshot of the versioned prompts')
  expect(text).not.toContain('Journal feature is not present')
  expect(text).toContain('infrastructure providers may process traffic, stored data or logs')
  expect(text).toContain("Direct database access is not recorded by the application's request audit log")
})

test('Foghouse Privacy notice replaces incompatible generic claims for opted-in instances', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', 'true')
  act(() => render(<Privacy />, container))
  expect(container.querySelector('a[href="/foghouse-privacy"]')).not.toBeNull()
  expect(container.textContent).not.toContain('We do not share your data with any third parties')
  expect(container.textContent).not.toContain('removed from the server for good')
})

test('preserves the generic policy for other self-hosters', () => {
  vi.stubEnv('VITE_FOGHOUSE_PRIVACY_ENABLED', 'false')
  act(() => render(<Privacy />, container))
  expect(container.querySelector('h1')?.textContent).toBe('Privacy Policy')
  expect(container.querySelector('a[href="/foghouse-privacy"]')).toBeNull()
  expect(container.textContent).toContain('Aurboda is a self-hosted')
})
