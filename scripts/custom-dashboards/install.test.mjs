import assert from 'node:assert/strict'
import test from 'node:test'

import { installBundle, resolveDashboardLinks } from './install.mjs'

const config = (target) => ({
  version: 1,
  sections: [
    {
      id: 'links',
      title: 'Links',
      type: 'links',
      widgets: [{ id: 'link', type: 'quick_link', config: { href: `dashboard:${target}`, label: target } }],
    },
  ],
})
const bundle = [
  { key: 'life', name: 'Life', visibility: 'private', config: config('work') },
  { key: 'work', name: 'Work', visibility: 'private', config: config('life') },
]
const makeApi = (initial = []) => {
  const state = { dashboards: structuredClone(initial), home: { version: 1, sections: [] }, calls: [] }
  const api = async (path, options = {}) => {
    const { method = 'GET' } = options
    const body = options.body ? JSON.parse(JSON.stringify(options.body)) : undefined
    state.calls.push({ path, method, ...options })
    if (path === '/dashboard') return { dashboard: structuredClone(state.home) }
    if (path.startsWith('/public/')) {
      assert.equal(options.anonymous, true)
      assert.equal(options.expected_status, 404)
      return { status: 404 }
    }
    if (path === '/shared-dashboards') {
      if (method === 'GET') return { dashboards: structuredClone(state.dashboards) }
      assert.equal(method, 'POST')
      const dashboard = {
        ...body,
        id: `id${state.dashboards.length}`,
        slug: `slug${state.dashboards.length}`,
      }
      state.dashboards.push(dashboard)
      return { dashboard: structuredClone(dashboard) }
    }
    const [, , id, data] = path.split('/')
    const dashboard = state.dashboards.find((item) => item.id === id)
    assert.ok(dashboard)
    if (data === 'data') {
      return { widget_data: { link: { type: 'quick_link', data: null } }, period: null, window: null }
    }
    if (method === 'PUT') Object.assign(dashboard, body)
    return { dashboard: structuredClone(dashboard) }
  }
  return { api, state }
}

test('resolves links without mutating source and rejects missing targets', () => {
  const original = config('life')
  assert.equal(
    resolveDashboardLinks(original, new Map([['life', '/u/me/slug']])).sections[0].widgets[0].config.href,
    '/u/me/slug',
  )
  assert.equal(original.sections[0].widgets[0].config.href, 'dashboard:life')
  assert.throws(() => resolveDashboardLinks(original, new Map()), /Unknown dashboard/)
})

test('dry run makes no writes', async () => {
  const { api, state } = makeApi()
  const result = await installBundle(api, bundle, { username: 'me' })
  assert.equal(result.created, 0)
  assert.equal(result.mode, 'dry-run')
  assert.ok(state.calls.every((call) => call.method === 'GET'))
})

test('creates private native configs, links them, verifies privacy, and preserves home', async () => {
  const { api, state } = makeApi()
  const result = await installBundle(api, bundle, { username: 'me', apply: true })
  assert.equal(result.created, 2)
  assert.equal(state.dashboards[0].config.sections[0].widgets[0].config.href, '/u/me/slug1')
  assert.equal(state.dashboards[1].config.sections[0].widgets[0].config.href, '/u/me/slug0')
  assert.ok(state.dashboards.every((board) => board.visibility === 'private'))
  assert.ok(state.calls.filter((call) => call.path === '/dashboard').every((call) => call.method === 'GET'))
  assert.ok(result.reports.every((report) => report.public_status === 404 && !report.navigation_needs_review))
})

test('reruns preserve all existing layouts and create no duplicates', async () => {
  const { api, state } = makeApi()
  await installBundle(api, bundle, { username: 'me', apply: true })
  state.dashboards[0].config.description = 'My edited layout'
  const before = structuredClone(state.dashboards)
  state.calls = []
  const result = await installBundle(api, bundle, { username: 'me', apply: true })
  assert.equal(result.created, 0)
  assert.deepEqual(state.dashboards, before)
  assert.ok(state.calls.every((call) => call.method === 'GET'))
})

test('rejects nonprivate or duplicate name collisions before writing', async () => {
  for (const initial of [
    [{ name: 'Work', visibility: 'public' }],
    [
      { name: 'Work', visibility: 'private' },
      { name: 'Work', visibility: 'private' },
    ],
  ]) {
    const { api, state } = makeApi(initial)
    await assert.rejects(installBundle(api, bundle, { username: 'me', apply: true }), /no changes made/)
    assert.ok(state.calls.every((call) => call.method === 'GET'))
  }
})

test('verify-only performs no writes and notices incomplete previous navigation', async () => {
  const { api, state } = makeApi()
  await installBundle(api, bundle, { username: 'me', apply: true })
  state.dashboards[0].config.sections[0].widgets[0].config.href = '/dashboards'
  state.calls = []
  const result = await installBundle(api, bundle, { username: 'me', verify_only: true })
  assert.equal(result.reports[0].navigation_needs_review, true)
  assert.ok(state.calls.every((call) => call.method === 'GET'))
})

test('detects concurrent home changes without overwriting them', async () => {
  const { api, state } = makeApi()
  let homeReads = 0
  const changingApi = async (path, options) => {
    if (path === '/dashboard' && ++homeReads === 2) state.home.description = 'Concurrent user edit'
    return api(path, options)
  }
  await assert.rejects(installBundle(changingApi, bundle, { username: 'me' }), /Home dashboard changed/)
  assert.equal(state.home.description, 'Concurrent user edit')
})

test('invalid private bundle or username fails before any API calls', async () => {
  const { api, state } = makeApi()
  await assert.rejects(installBundle(api, bundle, { username: '../other' }), /username/)
  await assert.rejects(
    installBundle(api, [{ ...bundle[0], visibility: 'unlisted' }], { username: 'me' }),
    /must be private/,
  )
  assert.equal(state.calls.length, 0)
})

test('verification compares JSON wire values when optional fields are undefined', async () => {
  const { api } = makeApi()
  const optionalBundle = structuredClone(bundle)
  optionalBundle[0].config.sections[0].description = undefined
  const result = await installBundle(api, optionalBundle, { username: 'me', apply: true })
  assert.equal(result.created, 2)
})
