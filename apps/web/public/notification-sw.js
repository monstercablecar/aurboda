/// <reference lib="webworker" />
const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self))

worker.addEventListener('push', (event) => {
  let tag
  let peopleReminder = false
  try {
    const data = event.data?.json()
    peopleReminder = data?.kind === 'people_reminder'
    if (typeof data?.tag === 'string' && /^[0-9a-f-]{36}$/i.test(data.tag)) tag = data.tag
  } catch {
    /* Invalid payloads still show a generic notification. */
  }
  event.waitUntil(
    worker.registration.showNotification(peopleReminder ? 'Aurboda reminder' : 'Aurboda Test', {
      body: peopleReminder ? 'You have a reminder in People.' : 'Notifications are working.',
      data: { kind: peopleReminder ? 'people_reminder' : 'test' },
      tag: tag ?? crypto.randomUUID(),
    }),
  )
})

worker.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    worker.clients.openWindow(event.notification.data?.kind === 'people_reminder' ? '/people' : '/settings'),
  )
})
