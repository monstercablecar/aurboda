import type { AdhdCommandBody } from '@aurboda/api-spec'

import { auth } from '../../state/auth'
import { currentSessionGeneration } from '../../state/sessionBoundary'

const prefix = 'aurboda-adhd-private:'
let identity = JSON.stringify([auth.value.user, auth.value.token])
auth.subscribe((value) => {
  const next = JSON.stringify([value.user, value.token])
  if (next !== identity) {
    identity = next
    for (const key of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))) {
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  }
})
export const sessionGuard = (generation: number) => {
  if (generation !== currentSessionGeneration() || !auth.value.user || !auth.value.token) {
    throw new Error('Account changed. Reopen this page before saving.')
  }
}
const key = (kind: string) => `${prefix}${auth.value.user}:${kind}`
export const storePrivate = (kind: string, value: unknown, generation: number) => {
  sessionGuard(generation)
  localStorage.setItem(key(kind), JSON.stringify({ expires: Date.now() + 24 * 60 * 60 * 1000, value }))
}
export const loadPrivate = <T>(kind: string, generation: number): T | null => {
  sessionGuard(generation)
  try {
    const data = JSON.parse(localStorage.getItem(key(kind)) ?? 'null')
    if (!data || data.expires < Date.now()) {
      localStorage.removeItem(key(kind))
      return null
    }
    return data.value as T
  } catch {
    localStorage.removeItem(key(kind))
    return null
  }
}
export const removePrivate = (kind: string, generation: number) => {
  sessionGuard(generation)
  localStorage.removeItem(key(kind))
}
export type PendingAdhdCommand = AdhdCommandBody
