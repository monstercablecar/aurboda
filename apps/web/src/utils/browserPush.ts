export const requestPushPermission = async (notifications: {
  permission: NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
}): Promise<void> => {
  const permission =
    notifications.permission === 'default'
      ? await notifications.requestPermission()
      : notifications.permission
  if (permission !== 'granted') {
    throw new Error(
      'Notification permission was not granted. Allow notifications in this browser’s site settings to try again.',
    )
  }
}

export const pushApplicationKey = (value: string): Uint8Array<ArrayBuffer> => {
  const decoded = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}
