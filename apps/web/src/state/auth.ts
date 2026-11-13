import type { ServerStatusResponse, SignupProfile } from '@aurboda/api-spec'
import type { AxiosError } from 'axios'

import { signal } from '@preact/signals'
import axios from 'axios'

import { API_URL } from '../config'
import { readNativeAuth } from '../embed'
import { apiErrorText } from '../utils/profile'
import { clearCachedDashboards } from './dashboardCache'
import { resetQuerySession } from './queryClient'
import { currentSessionGeneration, installSessionResponseFence } from './sessionBoundary'

export type SignupMode = 'open' | 'invite_only' | 'closed'

// When running embedded in the native app, seed auth from the WebView bridge so
// the app's bearer token is shared without a second login; otherwise fall back
// to browser-stored credentials.
const nativeAuth = readNativeAuth()
const savedAuth = localStorage.getItem('auth')
if (nativeAuth && savedAuth && savedAuth !== JSON.stringify(nativeAuth)) {
  clearCachedDashboards(() => localStorage)
}
export const auth = signal<{ user?: string; token?: string; is_admin?: boolean }>(
  nativeAuth ?? (savedAuth ? JSON.parse(savedAuth) : {}),
)
installSessionResponseFence(axios)
let sessionIdentity = JSON.stringify([auth.value.user, auth.value.token])
auth.subscribe((value) => {
  const identity = JSON.stringify([value.user, value.token])
  if (identity !== sessionIdentity) {
    sessionIdentity = identity
    resetQuerySession()
    clearCachedDashboards(() => localStorage)
  }
  localStorage.setItem('auth', JSON.stringify(value))
})

window.addEventListener('storage', (event) => {
  if (event.key !== 'auth' && event.key !== null) return
  try {
    const stored: unknown = event.newValue ? JSON.parse(event.newValue) : {}
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const value = stored as { user?: unknown; token?: unknown; is_admin?: unknown }
      auth.value = {
        user: typeof value.user === 'string' ? value.user : undefined,
        token: typeof value.token === 'string' ? value.token : undefined,
        is_admin: typeof value.is_admin === 'boolean' ? value.is_admin : undefined,
      }
    } else auth.value = {}
  } catch {
    auth.value = {}
  }
})

// Keep signupAllowed for backwards compatibility
export const signupAllowed = signal<boolean | undefined>(undefined)
export const signupMode = signal<SignupMode | undefined>(undefined)
export const serverBilling = signal<
  Pick<ServerStatusResponse, 'billing_enabled' | 'trial_days' | 'price_text'>
>({})
/** Whether the instance has an official feed, its blog at `/blog`. */
export const officialFeedEnabled = signal(false)
/** The last /status request failed: the signup mode is unknown, so say nothing about signing up. */
export const statusFailed = signal(false)

let statusFetchPromise: Promise<void> | null = null

export const fetchStatus = async () => {
  if (signupMode.value !== undefined) return
  if (statusFetchPromise) return statusFetchPromise

  statusFetchPromise = (async () => {
    try {
      const response = await axios.get<ServerStatusResponse>(`${API_URL}/status`)
      const { billing_enabled, official_feed, price_text, signup_allowed, signup_mode, trial_days } =
        response.data
      signupAllowed.value = signup_allowed
      signupMode.value = signup_mode
      officialFeedEnabled.value = official_feed === true
      serverBilling.value = { billing_enabled, price_text, trial_days }
      statusFailed.value = false
    } catch (error) {
      console.error('Status fetch error:', error)
      signupAllowed.value = false
      statusFailed.value = true
      statusFetchPromise = null
    }
  })()

  return statusFetchPromise
}

export const ensureStatusLoaded = () => fetchStatus()

export const login = async (user: string, pass: string): Promise<{ success: boolean; error?: string }> => {
  const generation = currentSessionGeneration()
  try {
    const response = await axios.post<{ token: string; is_admin?: boolean }>(`${API_URL}/login`, {
      password: pass,
      username: user,
    })

    if (generation !== currentSessionGeneration()) {
      return { success: false, error: 'Session changed; please try again.' }
    }
    if (response.data.token) {
      auth.value = { is_admin: response.data.is_admin, token: response.data.token, user }
      return { success: true }
    }
    return { error: 'No token received', success: false }
  } catch (error) {
    const axiosError = error as AxiosError<{ error?: string }>
    const message = axiosError.response?.data?.error ?? 'Login failed'
    console.error('Login error:', error)
    return { error: message, success: false }
  }
}

export const signup = async (
  user: string,
  pass: string,
  invitation?: string,
  profile: SignupProfile = {},
): Promise<{ success: boolean; error?: string }> => {
  const generation = currentSessionGeneration()
  try {
    const response = await axios.post<{ token: string; is_admin?: boolean }>(`${API_URL}/signup`, {
      ...profile,
      invitation,
      password: pass,
      username: user,
    })

    if (generation !== currentSessionGeneration()) {
      return { success: false, error: 'Session changed; please try again.' }
    }
    if (response.data.token) {
      auth.value = { is_admin: response.data.is_admin, token: response.data.token, user }
      return { success: true }
    }
    return { error: 'No token received', success: false }
  } catch (error) {
    const axiosError = error as AxiosError<{ error?: unknown }>
    const message = apiErrorText(axiosError.response?.data?.error, 'Signup failed')
    console.error('Signup error:', error)
    return { error: message, success: false }
  }
}

export const logout = () => {
  // Clear the narrowly scoped resource-media cookie as well as browser credentials.
  void axios.delete(`${API_URL}/resources/session`, { withCredentials: true }).catch(() => undefined)
  clearCachedDashboards(() => localStorage)
  auth.value = {}
}

/**
 * Map browser WebAuthn errors to user-friendly strings. The raw DOMException
 * messages ("The operation either timed out or was not allowed.") confuse
 * users — the underlying causes are usually cancellation or no matching
 * credential.
 */
const friendlyWebAuthnError = (error: unknown, fallback: string): string => {
  const e = error as { name?: string; message?: string } | undefined
  if (!e) return fallback
  switch (e.name) {
    case 'NotAllowedError':
      return 'Passkey prompt was cancelled or timed out.'
    case 'InvalidStateError':
      return 'A passkey for this account is already registered on this device.'
    case 'NotSupportedError':
      return 'This browser or device does not support passkeys.'
    case 'SecurityError':
      return 'Passkeys are not available on this origin (server may be misconfigured).'
    case 'AbortError':
      return 'Passkey prompt was cancelled.'
    default:
      return e.message ?? fallback
  }
}

export const signupWithPasskey = async (
  user: string,
  invitation?: string,
  profile: SignupProfile = {},
): Promise<{ success: boolean; error?: string }> => {
  const generation = currentSessionGeneration()
  try {
    const { startRegistration } = await import('@simplewebauthn/browser')

    const optionsResp = await axios.post<{ options_json: string; success: boolean; error?: string }>(
      `${API_URL}/webauthn/signup/options`,
      { invitation, username: user },
    )
    const optionsJSON = JSON.parse(optionsResp.data.options_json) as Parameters<
      typeof startRegistration
    >[0]['optionsJSON']
    const attestation = await startRegistration({ optionsJSON })

    if (generation !== currentSessionGeneration()) {
      return { success: false, error: 'Session changed; please try again.' }
    }
    const verifyResp = await axios.post<{
      token?: string
      is_admin?: boolean
      username?: string
      verified: boolean
      error?: string
    }>(`${API_URL}/webauthn/signup/verify`, {
      ...profile,
      response_json: JSON.stringify(attestation),
      username: user,
    })

    if (generation !== currentSessionGeneration()) {
      return { success: false, error: 'Session changed; please try again.' }
    }
    if (verifyResp.data.verified && verifyResp.data.token && verifyResp.data.username) {
      auth.value = {
        is_admin: verifyResp.data.is_admin,
        token: verifyResp.data.token,
        user: verifyResp.data.username,
      }
      return { success: true }
    }
    return { error: verifyResp.data.error ?? 'Signup failed', success: false }
  } catch (error) {
    const axiosError = error as AxiosError<{ error?: unknown }>
    const message = apiErrorText(
      axiosError.response?.data?.error,
      friendlyWebAuthnError(error, 'Passkey signup failed'),
    )
    console.error('Passkey signup error:', error)
    return { error: message, success: false }
  }
}

export const loginWithPasskey = async (): Promise<{ success: boolean; error?: string }> => {
  const generation = currentSessionGeneration()
  try {
    // Lazy-import to keep the WebAuthn dep out of the bundle for users who never use passkeys.
    const { startAuthentication } = await import('@simplewebauthn/browser')

    const optionsResp = await axios.post<{ options_json: string; success: boolean; error?: string }>(
      `${API_URL}/webauthn/auth/options`,
      {},
    )
    const optionsJSON = JSON.parse(optionsResp.data.options_json) as Parameters<
      typeof startAuthentication
    >[0]['optionsJSON']
    const assertion = await startAuthentication({ optionsJSON })

    if (generation !== currentSessionGeneration()) {
      return { success: false, error: 'Session changed; please try again.' }
    }
    const verifyResp = await axios.post<{
      token?: string
      is_admin?: boolean
      username?: string
      verified: boolean
      error?: string
    }>(`${API_URL}/webauthn/auth/verify`, { response_json: JSON.stringify(assertion) })

    if (generation !== currentSessionGeneration()) {
      return { success: false, error: 'Session changed; please try again.' }
    }
    if (verifyResp.data.verified && verifyResp.data.token && verifyResp.data.username) {
      auth.value = {
        is_admin: verifyResp.data.is_admin,
        token: verifyResp.data.token,
        user: verifyResp.data.username,
      }
      return { success: true }
    }
    return { error: verifyResp.data.error ?? 'Verification failed', success: false }
  } catch (error) {
    const axiosError = error as AxiosError<{ error?: string }>
    const apiError = axiosError.response?.data?.error
    const message = apiError ?? friendlyWebAuthnError(error, 'Passkey login failed')
    console.error('Passkey login error:', error)
    return { error: message, success: false }
  }
}
