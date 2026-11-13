import { describe, expect, test, vi } from 'vitest'

import { createBrowserPushService } from './browser-push.ts'

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: { auth: 'a'.repeat(22), p256dh: 'b'.repeat(87) },
}
const setup = () => {
  const deps = {
    configuration: () => ({
      publicKey: 'public',
      privateKey: 'private',
      subject: 'mailto:admin@example.org',
    }),
    save: vi.fn(async () => 'id'),
    get: vi.fn(async (user: string) => (user === 'alice' ? subscription : null)),
    remove: vi.fn(async () => true),
    send: vi.fn(async () => {}),
  }
  return { deps, service: createBrowserPushService(deps) }
}

describe('browser push pilot', () => {
  test('acceptance is not a delivery receipt; only the owned subscription is sent', async () => {
    const { deps, service } = setup()
    expect(await service.test('alice', 'id')).toEqual({ accepted: true })
    expect(deps.get).toHaveBeenCalledWith('alice', 'id')
    expect(deps.send).toHaveBeenCalledOnce()
    await expect(service.test('bob', 'id')).rejects.toMatchObject({ status: 404 })
    expect(deps.send).toHaveBeenCalledOnce()
  })
  test.each([404, 410])('removes an expired subscription after push service %s', async (statusCode) => {
    const { deps, service } = setup()
    deps.send.mockRejectedValueOnce({ statusCode })
    await expect(service.test('alice', 'id')).rejects.toMatchObject({ status: 410 })
    expect(deps.remove).toHaveBeenCalledWith('alice', 'id')
  })
  test('sanitizes provider failures and never retries', async () => {
    const { deps, service } = setup()
    deps.send.mockRejectedValueOnce(new Error('sensitive endpoint'))
    await expect(service.test('alice', 'id')).rejects.toMatchObject({
      status: 502,
      message: 'Push service did not accept the test. Try again later.',
    })
    expect(deps.send).toHaveBeenCalledOnce()
    expect(deps.remove).not.toHaveBeenCalled()
  })
  test('missing configuration is unavailable and does not write subscriptions', async () => {
    const { deps } = setup()
    const service = createBrowserPushService({ ...deps, configuration: () => null })
    expect(() => service.publicKey()).toThrow('not configured')
    await expect(service.register('alice', subscription)).rejects.toMatchObject({ status: 503 })
    expect(deps.save).not.toHaveBeenCalled()
  })
  test.each([
    'http://fcm.googleapis.com/test',
    'https://127.0.0.1/test',
    'https://localhost/test',
    'https://fcm.googleapis.com.evil.test/test',
    'https://name@fcm.googleapis.com/test',
    'https://fcm.googleapis.com:8443/test',
    'https://fcm.googleapis.com:443/test',
    'https://fcm.googleapis.com/test#fragment',
  ])('rejects unsafe endpoint %s', async (endpoint) => {
    const { deps, service } = setup()
    await expect(service.register('alice', { ...subscription, endpoint })).rejects.toMatchObject({
      status: 400,
    })
    expect(deps.save).not.toHaveBeenCalled()
  })
  test.each(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])(
    'accepts supported host %s',
    async (host) => {
      const { service } = setup()
      expect(
        await service.register('alice', { ...subscription, endpoint: `https://${host}/subscription` }),
      ).toBe('id')
    },
  )
})
