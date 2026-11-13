// @vitest-environment jsdom
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
let storage: Storage
beforeEach(() => {
  vi.resetModules()
  const values = new Map<string, string>()
  storage = {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => values.clear(),
  }
  vi.stubGlobal('localStorage', storage)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.AurbodaNative
})
const setup = async () => {
  const auth = await import('./auth')
  const query = await import('./queryClient')
  const { default: axios } = await import('axios')
  return { ...auth, query, axios }
}

test('direct user and token transitions replace caches and remove only dashboard persistence', async () => {
  const { auth, query } = await setup()
  auth.value = { user: 'alice', token: 'a' }
  const old = query.queryClient
  old.setQueryData(['private'], 'alice data')
  storage.setItem('aurboda:dashboard:alice', 'private dashboard')
  storage.setItem('work:draft:alice', 'unfinished draft')
  storage.setItem('unrelated', 'keep')
  auth.value = { user: 'bob', token: 'b' }
  expect(query.queryClient).not.toBe(old)
  expect(old.getQueryCache().getAll()).toHaveLength(0)
  expect(query.queryClient.getQueryData(['private'])).toBeUndefined()
  expect(storage.getItem('aurboda:dashboard:alice')).toBeNull()
  expect(storage.getItem('work:draft:alice')).toBe('unfinished draft')
  expect(storage.getItem('unrelated')).toBe('keep')
  const bob = query.queryClient
  auth.value = { user: 'bob', token: 'new-b' }
  expect(query.queryClient).not.toBe(bob)
  const same = query.queryClient
  auth.value = { user: 'bob', token: 'new-b', is_admin: true }
  expect(query.queryClient).toBe(same)
})

test('logout and relogin of the same user get fresh sessions', async () => {
  const { auth, logout, query, axios } = await setup()
  vi.spyOn(axios, 'delete').mockResolvedValue({ data: {} })
  auth.value = { user: 'alice', token: 'a' }
  const initial = query.queryClient
  logout()
  const signedOut = query.queryClient
  expect(signedOut).not.toBe(initial)
  auth.value = { user: 'alice', token: 'a' }
  expect(query.queryClient).not.toBe(initial)
  expect(query.queryClient).not.toBe(signedOut)
})

test('failed login does not retire unchanged session; successful login and signup do', async () => {
  const { auth, login, signup, query, axios } = await setup()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  auth.value = { user: 'alice', token: 'a' }
  const initial = query.queryClient
  const post = vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('No'))
  expect((await login('bob', 'wrong')).success).toBe(false)
  expect(query.queryClient).toBe(initial)
  post.mockResolvedValueOnce({ data: { token: 'b' } })
  await login('bob', 'pass')
  expect(query.queryClient).not.toBe(initial)
  const signedIn = query.queryClient
  post.mockResolvedValueOnce({ data: { token: 'c' } })
  await signup('carol', 'pass')
  expect(query.queryClient).not.toBe(signedIn)
})

test('late query results cannot populate the replacement client', async () => {
  const { auth, query } = await setup()
  auth.value = { user: 'alice', token: 'a' }
  const old = query.queryClient
  const request = deferred<string>()
  const result = old
    .fetchQuery({ queryKey: ['private'], queryFn: () => request.promise })
    .catch(() => undefined)
  auth.value = { user: 'bob', token: 'b' }
  request.resolve('alice secret')
  await result
  expect(query.queryClient.getQueryData(['private'])).toBeUndefined()
  expect(old.getQueryCache().getAll()).toHaveLength(0)
})

test('late mutation callbacks and retired mutation retries cannot affect the new session', async () => {
  const { auth, query } = await setup()
  auth.value = { user: 'alice', token: 'a' }
  const request = deferred<string>()
  const success = vi.fn(() => query.queryClient.setQueryData(['private'], 'stale write'))
  const failure = vi.fn()
  const settled = vi.fn()
  const old = query.queryClient
  const mutation = old.getMutationCache().build(old, {
    mutationFn: () => request.promise,
    onSuccess: success,
    onError: failure,
    onSettled: settled,
  })
  const result = mutation.execute(undefined).catch(() => undefined)
  await Promise.resolve()
  await Promise.resolve()
  auth.value = { user: 'bob', token: 'b' }
  request.resolve('alice secret')
  await result
  expect(success).not.toHaveBeenCalled()
  expect(failure).not.toHaveBeenCalled()
  expect(settled).not.toHaveBeenCalled()
  expect(old.getMutationCache().getAll()).toHaveLength(0)
  expect(query.queryClient.getQueryData(['private'])).toBeUndefined()
})

test('Axios fence stops old query continuations from restoring persistent dashboards', async () => {
  const { auth, axios } = await setup()
  auth.value = { user: 'alice', token: 'a' }
  const request = deferred<AxiosResponse>()
  let config: InternalAxiosRequestConfig | undefined
  const result = axios
    .get('/private', {
      adapter: (value) => {
        config = value
        return request.promise
      },
    })
    .then(() => storage.setItem('aurboda:dashboard:alice', 'stale'))
    .catch(() => undefined)
  auth.value = { user: 'bob', token: 'b' }
  if (!config) throw new Error('Request did not start synchronously')
  request.resolve({ data: 'private', status: 200, statusText: 'OK', headers: {}, config })
  await result
  expect(storage.getItem('aurboda:dashboard:alice')).toBeNull()
})

test('native startup uses bridge credentials and later native/direct changes retire the session', async () => {
  storage.setItem('auth', JSON.stringify({ user: 'saved', token: 'saved-token' }))
  window.AurbodaNative = { getAuth: () => JSON.stringify({ user: 'native', token: 'native-token' }) }
  const { auth, query } = await setup()
  expect(auth.value.user).toBe('native')
  const initial = query.queryClient
  auth.value = { user: 'native', token: 'replacement-native' }
  expect(query.queryClient).not.toBe(initial)
})

test('per-call observer mutation callbacks are detached synchronously at transition', async () => {
  const { auth, query } = await setup()
  const { MutationObserver } = await import('@tanstack/react-query')
  auth.value = { user: 'alice', token: 'a' }
  const request = deferred<string>()
  const observer = new MutationObserver(query.queryClient, { mutationFn: () => request.promise })
  const unsubscribe = observer.subscribe(() => {})
  const success = vi.fn()
  const error = vi.fn()
  const settled = vi.fn()
  const result = observer
    .mutate(undefined, { onSuccess: success, onError: error, onSettled: settled })
    .catch(() => undefined)
  await Promise.resolve()
  await Promise.resolve()
  auth.value = { user: 'bob', token: 'b' }
  request.resolve('old')
  await result
  expect(success).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  expect(settled).not.toHaveBeenCalled()
  unsubscribe()
})

test('cross-tab auth updates and removal replace cache without touching unrelated storage', async () => {
  const { auth, query } = await setup()
  auth.value = { user: 'alice', token: 'a' }
  const initial = query.queryClient
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'auth', newValue: JSON.stringify({ user: 'bob', token: 'b' }) }),
  )
  expect(auth.value.user).toBe('bob')
  expect(query.queryClient).not.toBe(initial)
  const bob = query.queryClient
  window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'keep' }))
  expect(query.queryClient).toBe(bob)
  window.dispatchEvent(new StorageEvent('storage', { key: 'auth', newValue: null }))
  expect(auth.value.token).toBeUndefined()
  expect(query.queryClient).not.toBe(bob)
})

test('mutation option re-defaulting preserves callback behavior in the active session', async () => {
  const { query } = await setup()
  const success = vi.fn()
  const defaults = query.queryClient.defaultMutationOptions({
    mutationFn: async () => 'ok',
    onSuccess: success,
  })
  const repeated = query.queryClient.defaultMutationOptions(defaults)
  expect(repeated).toBe(defaults)
  const mutation = query.queryClient.getMutationCache().build(query.queryClient, repeated)
  expect(await mutation.execute(undefined)).toBe('ok')
  expect(success).toHaveBeenCalledTimes(1)
})

test('an old password login cannot replace a newer direct session', async () => {
  const { auth, login, axios } = await setup()
  const response = deferred<{ data: { token: string } }>()
  vi.spyOn(axios, 'post').mockImplementation(() => response.promise)
  const pending = login('alice', 'password')
  auth.value = { user: 'bob', token: 'b' }
  response.resolve({ data: { token: 'a' } })
  expect((await pending).success).toBe(false)
  expect(auth.value.user).toBe('bob')
})

test('passkey login and signup use the same session transition boundary', async () => {
  const { loginWithPasskey, signupWithPasskey, query, axios } = await setup()
  const { startAuthentication, startRegistration } = await import('@simplewebauthn/browser')
  vi.mocked(startAuthentication).mockResolvedValue({} as Awaited<ReturnType<typeof startAuthentication>>)
  vi.mocked(startRegistration).mockResolvedValue({} as Awaited<ReturnType<typeof startRegistration>>)
  const post = vi.spyOn(axios, 'post')
  const initial = query.queryClient
  post
    .mockResolvedValueOnce({ data: { options_json: '{}' } })
    .mockResolvedValueOnce({ data: { verified: true, username: 'alice', token: 'a' } })
  expect((await loginWithPasskey()).success).toBe(true)
  expect(query.queryClient).not.toBe(initial)
  const loggedIn = query.queryClient
  post
    .mockResolvedValueOnce({ data: { options_json: '{}' } })
    .mockResolvedValueOnce({ data: { verified: true, username: 'bob', token: 'b' } })
  expect((await signupWithPasskey('bob')).success).toBe(true)
  expect(query.queryClient).not.toBe(loggedIn)
})

test('a passkey prompt completing after account switch cannot start verification', async () => {
  const { loginWithPasskey, auth, axios } = await setup()
  const { startAuthentication } = await import('@simplewebauthn/browser')
  const prompt = deferred<Awaited<ReturnType<typeof startAuthentication>>>()
  vi.mocked(startAuthentication).mockImplementation(() => prompt.promise)
  const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { options_json: '{}' } })
  const pending = loginWithPasskey()
  await vi.waitFor(() => expect(startAuthentication).toHaveBeenCalled())
  auth.value = { user: 'bob', token: 'b' }
  prompt.resolve({} as Awaited<ReturnType<typeof startAuthentication>>)
  expect((await pending).success).toBe(false)
  expect(post).toHaveBeenCalledTimes(1)
  expect(auth.value.user).toBe('bob')
})
