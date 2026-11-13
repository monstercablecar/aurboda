import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'

const setup = async () => {
  const handlers = new Map<string, (event: unknown) => void>()
  const showNotification = vi.fn(async () => {})
  const openWindow = vi.fn(async () => {})
  vm.runInNewContext(
    await readFile(new URL('../../../web/public/notification-sw.js', import.meta.url), 'utf8'),
    {
      self: {
        addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
        registration: { showNotification },
        clients: { openWindow },
      },
      crypto: { randomUUID: () => 'fallback' },
    },
  )
  return { handlers, showNotification, openWindow }
}
test('People push ignores private payload text and arbitrary destinations', async () => {
  const { handlers, showNotification, openWindow } = await setup()
  handlers.get('push')?.({
    data: {
      json: () => ({
        kind: 'people_reminder',
        title: 'private',
        body: 'secret',
        url: 'https://evil.example',
      }),
    },
    waitUntil: () => {},
  })
  expect(showNotification).toHaveBeenCalledWith('Aurboda reminder', {
    body: 'You have a reminder in People.',
    tag: 'fallback',
    data: { kind: 'people_reminder' },
  })
  handlers.get('notificationclick')?.({
    notification: { close: () => {}, data: { kind: 'people_reminder', url: 'https://evil.example' } },
    waitUntil: () => {},
  })
  expect(openWindow).toHaveBeenCalledWith('/people')
})
test('existing notification test still opens Settings', async () => {
  const { handlers, showNotification, openWindow } = await setup()
  handlers.get('push')?.({ data: { json: () => ({ title: 'untrusted' }) }, waitUntil: () => {} })
  expect(showNotification).toHaveBeenCalledWith('Aurboda Test', {
    body: 'Notifications are working.',
    tag: 'fallback',
    data: { kind: 'test' },
  })
  handlers.get('notificationclick')?.({
    notification: { close: () => {}, data: { kind: 'test' } },
    waitUntil: () => {},
  })
  expect(openWindow).toHaveBeenCalledWith('/settings')
})
