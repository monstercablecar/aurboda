#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { createSharedDashboardBodySchema } from '../../packages/api-spec/dist/index.js'

export const resolveDashboardLinks = (config, paths, fallback) => ({
  ...config,
  sections: config.sections.map((section) => ({
    ...section,
    widgets: section.widgets.map((widget) => {
      if (widget.type !== 'quick_link' || !widget.config.href.startsWith('dashboard:')) return widget
      const key = widget.config.href.slice('dashboard:'.length)
      const href = paths.get(key) ?? fallback
      if (!href) throw new Error(`Unknown dashboard link: ${key}`)
      return { ...widget, config: { ...widget.config, href } }
    }),
  })),
})

const checkBundle = (bundle) => {
  const keys = new Set()
  const names = new Set()
  for (const item of bundle) {
    if (keys.has(item.key) || names.has(item.name)) throw new Error('Duplicate bundle key or name')
    if (item.visibility !== 'private') throw new Error('Bundle dashboards must be private')
    keys.add(item.key)
    names.add(item.name)
    createSharedDashboardBodySchema.parse({ name: item.name, config: item.config, visibility: 'private' })
  }
  const placeholders = new Map([...keys].map((key) => [key, '/dashboards']))
  for (const item of bundle) resolveDashboardLinks(item.config, placeholders)
}

const matchExisting = (bundle, dashboards) => {
  const result = new Map()
  for (const item of bundle) {
    const matches = dashboards.filter((dashboard) => dashboard.name === item.name)
    if (matches.length > 1) throw new Error(`Multiple dashboards named ${item.name}; no changes made`)
    if (matches[0] && matches[0].visibility !== 'private') {
      throw new Error(`Existing dashboard ${item.name} is not private; no changes made`)
    }
    if (matches[0]) result.set(item.key, matches[0])
  }
  return result
}

const dashboardPath = (username, slug) => `/u/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
const widgetsOf = (config) => config.sections.flatMap((section) => section.widgets)

export const verifyBundle = async (api, bundle, username, expected = new Map()) => {
  const dashboards = matchExisting(bundle, (await api('/shared-dashboards')).dashboards)
  const reports = []
  for (const item of bundle) {
    const dashboard = dashboards.get(item.key)
    if (!dashboard) throw new Error(`Dashboard missing: ${item.name}`)
    const stored = (await api(`/shared-dashboards/${dashboard.id}`)).dashboard
    if (stored.visibility !== 'private') throw new Error(`Dashboard is not private: ${item.name}`)
    if (expected.has(item.key) && !isDeepStrictEqual(stored.config, expected.get(item.key))) {
      throw new Error(`Saved configuration differs: ${item.name}`)
    }
    const started = performance.now()
    const data = await api(`/shared-dashboards/${dashboard.id}/data`)
    await api(`/public/${encodeURIComponent(username)}/${encodeURIComponent(dashboard.slug)}`, {
      anonymous: true,
      expected_status: 404,
    })
    const widget_data = Object.values(data.widget_data ?? {})
    const links = widgetsOf(stored.config).filter((widget) => widget.type === 'quick_link')
    reports.push({
      key: item.key,
      name: item.name,
      path: dashboardPath(username, dashboard.slug),
      visibility: stored.visibility,
      widgets: widgetsOf(stored.config).length,
      resolved_widgets: widget_data.length,
      null_data_widgets: widget_data.filter((widget) => widget.data === null).length,
      empty_series_widgets: widget_data.filter((widget) =>
        ['series', 'buckets'].some(
          (key) => Array.isArray(widget.data?.[key]) && widget.data[key].length === 0,
        ),
      ).length,
      period: data.period ?? null,
      window: data.window ?? null,
      elapsed_ms: Math.round(performance.now() - started),
      public_status: 404,
      navigation_needs_review:
        links.some((widget) => widget.config.href.startsWith('dashboard:')) ||
        widgetsOf(item.config).some(
          (widget) =>
            widget.type === 'quick_link' &&
            widget.config.href.startsWith('dashboard:') &&
            links.some((link) => link.id === widget.id && link.config.href === '/dashboards'),
        ),
    })
  }
  return reports
}

const createMissing = async (api, bundle, existing, username, created, expected) => {
  for (const item of bundle) {
    if (existing.has(item.key)) continue
    const body = createSharedDashboardBodySchema.parse({
      name: item.name,
      config: resolveDashboardLinks(item.config, new Map(), '/dashboards'),
      visibility: 'private',
    })
    const { dashboard } = await api('/shared-dashboards', { method: 'POST', body })
    if (dashboard.visibility !== 'private') throw new Error(`New dashboard is not private: ${item.name}`)
    existing.set(item.key, dashboard)
    created.set(item.key, dashboard)
  }
  const paths = new Map([...existing].map(([key, board]) => [key, dashboardPath(username, board.slug)]))
  for (const item of bundle) {
    const board = created.get(item.key)
    if (!board) continue
    const config = resolveDashboardLinks(item.config, paths)
    await api(`/shared-dashboards/${board.id}`, {
      method: 'PUT',
      body: { config, visibility: 'private' },
    })
    expected.set(item.key, JSON.parse(JSON.stringify(config)))
  }
}

const assertHomeUnchanged = async (api, home) => {
  if (!isDeepStrictEqual(home, (await api('/dashboard')).dashboard)) {
    throw new Error('Home dashboard changed during this run; no home writes were performed by the installer')
  }
}

// api(path, { method?, body?, anonymous?, expected_status? }) returns parsed JSON.
export const installBundle = async (api, bundle, { username, apply = false, verify_only = false }) => {
  if (!/^[a-zA-Z0-9_]+$/.test(username ?? '')) throw new Error('An explicit valid username is required')
  if (apply && verify_only) throw new Error('Choose apply or verify-only, not both')
  checkBundle(bundle)
  const home = (await api('/dashboard')).dashboard
  const existing = matchExisting(bundle, (await api('/shared-dashboards')).dashboards)
  const created = new Map()
  const expected = new Map()
  try {
    if (apply) {
      await createMissing(api, bundle, existing, username, created, expected)
    }
    const reports =
      apply || verify_only
        ? await verifyBundle(api, bundle, username, expected)
        : bundle.map((item) => ({
            key: item.key,
            name: item.name,
            action: existing.has(item.key) ? 'preserve' : 'create private',
            widgets: widgetsOf(item.config).length,
          }))
    return { mode: apply ? 'apply' : verify_only ? 'verify-only' : 'dry-run', created: created.size, reports }
  } finally {
    await assertHomeUnchanged(api, home)
  }
}

const main = async () => {
  const [username, ...flags] = process.argv.slice(2)
  if (!username || flags.some((flag) => !['--apply', '--verify-only'].includes(flag))) {
    throw new Error('Usage: node scripts/custom-dashboards/install.mjs USERNAME [--apply | --verify-only]')
  }
  const { buildDashboards } = await import('./configs.mjs')
  const { createAuth } = await import('../../apps/backend/src/auth.ts')
  const token = createAuth(process.env.SESSION_SECRET ?? '').createToken(username)
  const api = async (path, { method = 'GET', body, anonymous = false, expected_status } = {}) => {
    const response = await fetch(`http://127.0.0.1:3000${path}`, {
      method,
      headers: {
        ...(!anonymous ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    })
    if (expected_status !== undefined) {
      if (response.status !== expected_status) {
        throw new Error(`${method} ${path}: unexpected HTTP ${response.status}`)
      }
      return { status: response.status }
    }
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`)
    const result = await response.json()
    if (result.success === false) throw new Error(`${method} ${path}: API rejected request`)
    return result
  }
  console.info(
    JSON.stringify(
      await installBundle(api, buildDashboards(), {
        username,
        apply: flags.includes('--apply'),
        verify_only: flags.includes('--verify-only'),
      }),
      null,
      2,
    ),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
