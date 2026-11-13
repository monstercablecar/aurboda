import { describe, expect, test, vi } from 'vitest'

import { pushApplicationKey, requestPushPermission } from './browserPush'

describe('browser notification permission', () => {
  test('requests permission once when required and does not hide denial', async () => {
    const requestPermission = vi.fn(async () => 'denied' as const)
    await expect(requestPushPermission({ permission: 'default', requestPermission })).rejects.toThrow(
      'not granted',
    )
    expect(requestPermission).toHaveBeenCalledOnce()
  })
  test('existing permissions never trigger a new prompt', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const)
    await requestPushPermission({ permission: 'granted', requestPermission })
    await expect(requestPushPermission({ permission: 'denied', requestPermission })).rejects.toThrow(
      'not granted',
    )
    expect(requestPermission).not.toHaveBeenCalled()
  })
  test('decodes the URL-safe application key', () => {
    expect([...pushApplicationKey('-_8')]).toEqual([251, 255])
  })
})
