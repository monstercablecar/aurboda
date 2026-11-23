import { API_URL } from '../config'

let barrier: Promise<unknown> = Promise.resolve()
export const familyIdentity = () =>
  document.cookie
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('aurboda_family_identity='))
    ?.split('=')[1] ?? ''
export const familySessionBarrier = () => barrier
export const initializeFamilyIdentity = (identityChanged = false) => {
  if (identityChanged || !familyIdentity()) rotateFamilyIdentity()
}
export const rotateFamilyIdentity = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const binding = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  document.cookie = `aurboda_family_identity=${binding}; Path=/; SameSite=Strict${window.location.protocol === 'https:' ? '; Secure' : ''}`
  // Synchronous binding rotation rejects old/late cookies even before this request completes.
  barrier = barrier
    .catch(() => undefined)
    .then(() =>
      fetch(`${API_URL}/family-photos/session`, {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => undefined),
    )
}
