// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

import { acceptSessionResponse, auth } from './auth'
import { currentSessionGeneration } from './sessionBoundary'

afterEach(() => {
  auth.value = {}
})

test('a completed sign-in cannot replace an account selected while it was pending', () => {
  const generation = currentSessionGeneration()
  auth.value = { user: 'second', token: 'second-token' }
  expect(acceptSessionResponse({ username: 'first', token: 'first-token' }, generation)).toBe(false)
  expect(auth.value.user).toBe('second')
})

test('a completed recovery cannot sign in again after logout', () => {
  auth.value = { user: 'first', token: 'first-token' }
  const generation = currentSessionGeneration()
  auth.value = {}
  expect(acceptSessionResponse({ username: 'first', token: 'recovered-token' }, generation)).toBe(false)
  expect(auth.value).toEqual({})
})

test('a current complete response starts a fresh session, an incomplete one does not', () => {
  expect(acceptSessionResponse({ username: 'first' }, currentSessionGeneration())).toBe(false)
  expect(acceptSessionResponse({ username: 'first', token: 'new-token' }, currentSessionGeneration())).toBe(
    true,
  )
  expect(auth.value.user).toBe('first')
})
