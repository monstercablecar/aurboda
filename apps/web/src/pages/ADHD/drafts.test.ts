// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }))
beforeEach(() => {
  vi.resetModules()
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>()
    vi.stubGlobal(name, {
      get length() {
        return values.size
      },
      key: (i: number) => [...values.keys()][i] ?? null,
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
      clear: () => values.clear(),
    })
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const setup = async () => {
  const { auth } = await import('../../state/auth')
  auth.value = { user: 'synthetic-a', token: 'a' }
  const d = await import('./drafts'),
    s = await import('../../state/sessionBoundary')
  return { auth, ...d, ...s }
}
test('same-account reload retains uncertain request while switch/logout removes all private drafts and old dispatch cannot write', async () => {
  const d = await setup(),
    g = d.currentSessionGeneration(),
    value = { request_id: 'fixed-key', command: { operation: 'observe' } }
  d.storePrivate('pending', value, g)
  expect(d.loadPrivate('pending', g)).toEqual(value)
  d.auth.value = { user: 'synthetic-b', token: 'b' }
  expect(
    Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) =>
      k?.startsWith('aurboda-adhd-private:'),
    ),
  ).toHaveLength(0)
  expect(() => d.storePrivate('pending', value, g)).toThrow('Account changed')
  expect(() => d.loadPrivate('pending', g)).toThrow('Account changed')
  const next = d.currentSessionGeneration()
  d.storePrivate('check', { target: 'Synthetic B' }, next)
  d.auth.value = {}
  expect(
    Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) =>
      k?.startsWith('aurboda-adhd-private:'),
    ),
  ).toHaveLength(0)
})
test('draft expiry and delayed callback fence', async () => {
  const d = await setup(),
    g = d.currentSessionGeneration(),
    real = Date.now()
  d.storePrivate('check', { target: 'Synthetic' }, g)
  vi.spyOn(Date, 'now').mockReturnValue(real + 25 * 60 * 60 * 1000)
  expect(d.loadPrivate('check', g)).toBeNull()
  let dispatches = 0
  const delayed = () => {
    d.sessionGuard(g)
    dispatches++
  }
  d.auth.value = { user: 'synthetic-a', token: 'rotated' }
  expect(delayed).toThrow('Account changed')
  expect(dispatches).toBe(0)
})
