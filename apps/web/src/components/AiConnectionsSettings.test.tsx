// @vitest-environment jsdom
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import axios, { AxiosError } from 'axios'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest'

import { auth } from '../state/auth'
import { queryClient } from '../state/queryClient'
import { AiConnectionsSettings } from './AiConnectionsSettings'
import { SessionBoundary } from './SessionBoundary'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  })
})
afterAll(() => vi.unstubAllGlobals())

vi.mock('../config', () => ({ API_URL: '/api' }))

let container: HTMLDivElement
let adapter: AxiosAdapter | typeof axios.defaults.adapter
let requests: InternalAxiosRequestConfig[]
let handle: (config: InternalAxiosRequestConfig) => Promise<unknown>
const connection = (client_id: string, scope: string | null = 'read', client_name = client_id) => ({
  client_id,
  client_name,
  scope,
})
const list = (...connections: ReturnType<typeof connection>[]) => ({ success: true, connections })
const response = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({
  config,
  data,
  headers: {},
  status: 200,
  statusText: 'OK',
})
const fail = (config: InternalAxiosRequestConfig, message: string) => {
  throw new AxiosError(message, 'ERR_BAD_RESPONSE', config, undefined, {
    ...response(config, { success: false, error: message }),
    status: 503,
  })
}
const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
const mount = async () => {
  act(() =>
    render(
      <SessionBoundary>
        <AiConnectionsSettings />
      </SessionBoundary>,
      container,
    ),
  )
  await settle()
}
const button = (name: string) => {
  const found = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === name)
  if (!found) throw new Error(`Missing button: ${name}`)
  return found
}

beforeEach(() => {
  adapter = axios.defaults.adapter
  requests = []
  handle = async () => list()
  axios.defaults.adapter = async (config) => {
    requests.push(config)
    return response(config, await handle(config))
  }
  auth.value = { user: 'alice', token: 'alice-browser-token' }
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  auth.value = {}
  axios.defaults.adapter = adapter
})

test('loads own connections, labels permissions and treats client names as text', async () => {
  const loading = deferred()
  handle = () => loading.promise
  await mount()
  expect(container.textContent).toContain('Loading connections')
  await act(async () =>
    loading.resolve(
      list(
        connection('reader', 'read', '<script>unsafe()</script>'),
        connection('writer', 'read write'),
        connection('writer', 'read'),
        connection('old', null),
      ),
    ),
  )
  await settle()
  expect(container.textContent).toContain('<script>unsafe()</script>')
  expect(container.querySelector('script')).toBeNull()
  expect(container.textContent).toContain('Read-only analysis')
  expect(container.textContent).toContain('Read and write')
  expect(container.textContent).toContain('Legacy full access')
  expect(container.querySelectorAll('li')).toHaveLength(3)
  expect(requests[0].url).toBe('/api/oauth/connections')
  expect(requests[0].headers.Authorization).toBe('Bearer alice-browser-token')
})

test('revokes with only client_id, prevents duplicate pending requests and refreshes', async () => {
  const pending = deferred()
  let revoked = false
  handle = async (config) => {
    if (config.method === 'post') {
      await pending.promise
      revoked = true
      return { success: true }
    }
    return revoked ? list() : list(connection('reader'))
  }
  await mount()
  act(() => {
    button('Revoke access').click()
    button('Revoke access').click()
  })
  await settle()
  expect(requests.filter((item) => item.method === 'post')).toHaveLength(1)
  expect(button('Revoking…').disabled).toBe(true)
  const post = requests.find((item) => item.method === 'post')
  if (!post) throw new Error('Missing revoke request')
  expect(post.url).toBe('/api/oauth/connections/revoke')
  expect(JSON.parse(post.data)).toEqual({ client_id: 'reader' })
  expect(post.headers.Authorization).toBe('Bearer alice-browser-token')
  await act(async () => pending.resolve(undefined))
  await settle()
  expect(container.textContent).toContain('No active AI or MCP connections')
  expect(requests.filter((item) => item.method === 'get')).toHaveLength(2)
})

test('reports loading errors and lets the user retry', async () => {
  handle = async (config) => fail(config, 'Connections temporarily unavailable')
  await mount()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Connections temporarily unavailable',
  )
  handle = async () => list()
  act(() => button('Retry').click())
  await settle()
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('No active AI or MCP connections')
})

test('failed revocation leaves the connection available to retry', async () => {
  let reject = true
  handle = async (config) => {
    if (config.method === 'post') {
      if (reject) return fail(config, 'Could not revoke this connection')
      return { success: true }
    }
    return reject ? list(connection('reader')) : list()
  }
  await mount()
  act(() => button('Revoke access').click())
  await settle()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not revoke this connection')
  reject = false
  act(() => button('Revoke access').click())
  await settle()
  expect(container.textContent).toContain('No active AI or MCP connections')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

test('an account switch clears connection state and fences a late revocation response', async () => {
  const pending = deferred()
  handle = async (config) => {
    if (config.method === 'post') return pending.promise
    return config.headers.Authorization === 'Bearer alice-browser-token'
      ? list(connection('alice-private-client'))
      : list(connection('bob-client'))
  }
  await mount()
  act(() => button('Revoke access').click())
  await settle()
  act(() => {
    auth.value = { user: 'bob', token: 'bob-browser-token' }
  })
  await settle()
  expect(container.textContent).toContain('bob-client')
  expect(container.textContent).not.toContain('alice-private-client')
  await act(async () => pending.resolve({ success: true }))
  await settle()
  expect(container.textContent).toContain('bob-client')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(button('Revoke access').disabled).toBe(false)
  expect(requests.filter((item) => item.headers.Authorization === 'Bearer bob-browser-token')).toHaveLength(1)
  expect(queryClient.getQueryData(['oauthConnections'])).toEqual(list(connection('bob-client')))
})
