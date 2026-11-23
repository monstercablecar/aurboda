// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'

import {
  familyIdentity,
  familySessionBarrier,
  initializeFamilyIdentity,
  rotateFamilyIdentity,
} from './familyIdentity'
afterEach(() => vi.unstubAllGlobals())
test('same-account second-tab initialization preserves the active media binding', () => {
  const fetcher = vi.fn().mockResolvedValue(new Response())
  vi.stubGlobal('fetch', fetcher)
  document.cookie = `aurboda_family_identity=${'c'.repeat(32)}; Path=/`
  initializeFamilyIdentity()
  initializeFamilyIdentity()
  expect(familyIdentity()).toBe('c'.repeat(32))
  expect(fetcher).not.toHaveBeenCalled()
  initializeFamilyIdentity(true)
  expect(familyIdentity()).not.toBe('c'.repeat(32))
})
test('rotates a readable noncredential binding synchronously while invalidation is pending', async () => {
  let finish!: (value: Response) => void
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  rotateFamilyIdentity()
  const first = familyIdentity()
  expect(first).toMatch(/^[a-f0-9]{32}$/)
  await Promise.resolve()
  await Promise.resolve()
  rotateFamilyIdentity()
  expect(familyIdentity()).not.toBe(first)
  finish(new Response())
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  if (fetcher.mock.calls.length > 1) finish(new Response())
  else {
    await Promise.resolve()
    finish(new Response())
  }
  await familySessionBarrier()
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/family-photos/session'),
    expect.objectContaining({ method: 'DELETE', cache: 'no-store' }),
  )
})
