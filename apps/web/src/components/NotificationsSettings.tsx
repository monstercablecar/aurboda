import type { BrowserPushResponse } from '@aurboda/api-spec'

import axios from 'axios'
import { useRef, useState } from 'preact/hooks'

import { API_URL } from '../config'
import { isEmbedded } from '../embed'
import { auth } from '../state/auth'
import { pushApplicationKey, requestPushPermission } from '../utils/browserPush'
import { SettingsSection } from './SettingsSection'

const endpoint = `${API_URL}/notifications/web-push`

const browserPushSupported = () =>
  !isEmbedded() &&
  !window.AurbodaNative &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

const registerBrowser = async (options: { headers: { Authorization: string } }) => {
  const key = await axios.get<BrowserPushResponse>(endpoint + '/public-key', options)
  if (!key.data.public_key) throw new Error('Browser notifications are unavailable on this server.')
  await navigator.serviceWorker.register('/notification-sw.js', { scope: '/' })
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: pushApplicationKey(key.data.public_key),
    }))
  const serialized = subscription.toJSON()
  const registered = await axios.post<BrowserPushResponse>(
    endpoint + '/subscription',
    {
      endpoint: serialized.endpoint,
      keys: serialized.keys,
    },
    options,
  )
  const id = registered.data.subscription_id
  if (!id) throw new Error('The browser subscription could not be registered.')
  return id
}

const unsubscribeBrowser = async () => {
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription && !(await subscription.unsubscribe())) {
    throw new Error('The browser could not disable notifications. Try again.')
  }
}
const notificationError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? 'Could not contact the notification service.'
  }
  return error instanceof Error ? error.message : 'Browser notification request failed.'
}

export function NotificationsSettings() {
  const storageKey = `browser_push:${auth.value.user ?? ''}`
  const supported = browserPushSupported()
  const [subscriptionId, setSubscriptionId] = useState(() => localStorage.getItem(storageKey))
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const options = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })
  const remember = (id: string | null) => {
    if (id) localStorage.setItem(storageKey, id)
    else localStorage.removeItem(storageKey)
    setSubscriptionId(id)
  }
  const run = async (action: 'enable' | 'test' | 'disable') => {
    if (lock.current || !supported) return
    lock.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      if (action === 'disable') {
        if (subscriptionId) {
          await axios
            .delete(endpoint + '/subscription', { ...options(), data: { subscription_id: subscriptionId } })
            .catch((error: unknown) => {
              if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error
            })
        }
        await unsubscribeBrowser()
        remember(null)
        setMessage('Browser notifications disabled on this device.')
        return
      }
      await requestPushPermission(Notification)
      const id = await registerBrowser(options())
      remember(id)
      if (action === 'test') {
        const response = await axios.post<BrowserPushResponse>(
          endpoint + '/test',
          { subscription_id: id },
          options(),
        )
        if (!response.data.accepted) throw new Error('The push service did not accept the test.')
        setMessage('Push service accepted the test. Check this device for the notification.')
      } else {
        setMessage('Browser registered. Send a test to check notifications on this device.')
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 410) {
        remember(null)
        await unsubscribeBrowser().catch(() => {})
      }
      setFailed(true)
      setMessage(notificationError(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <SettingsSection
      title="Browser notifications"
      description="Notifications come from this browser, not the native Aurboda app. This pilot sends only a test when you ask; it does not schedule reminders."
    >
      <p>
        {!supported
          ? 'Unsupported here. Open this site in a browser that supports Web Push.'
          : Notification.permission === 'granted'
            ? 'Available'
            : 'Permission required'}
      </p>
      <button disabled={!supported || busy} onClick={() => run('enable')}>
        Enable browser notifications
      </button>{' '}
      <button disabled={!supported || busy || !subscriptionId} onClick={() => run('test')}>
        Send test notification
      </button>{' '}
      <button disabled={!supported || busy || !subscriptionId} onClick={() => run('disable')}>
        Disable on this browser
      </button>
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    </SettingsSection>
  )
}
