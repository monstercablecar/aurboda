import assert from 'node:assert/strict'
import test from 'node:test'

import { createSharedDashboardBodySchema } from '../../packages/api-spec/dist/index.js'
import { buildDashboards } from './configs.mjs'

const dashboards = buildDashboards()
const widgetsOf = (dashboard) => dashboard.config.sections.flatMap((section) => section.widgets)

test('all seven configurations validate against the installed shared API schema and are private', () => {
  assert.equal(dashboards.length, 7)
  assert.equal(new Set(dashboards.map((dashboard) => dashboard.key)).size, dashboards.length)
  for (const { key, ...body } of dashboards) {
    assert.equal(body.visibility, 'private', key)
    assert.deepEqual(createSharedDashboardBodySchema.parse(body), { ...body, period_lock: 'latest' }, key)
  }
})

test('section and widget identities are unique within each dashboard', () => {
  for (const dashboard of dashboards) {
    const ids = [...dashboard.config.sections, ...widgetsOf(dashboard)].map(({ id }) => id)
    assert.equal(new Set(ids).size, ids.length, dashboard.key)
  }
})

test('navigation resolves to known local pages or bundle dashboard keys', () => {
  const paths = new Set([
    '/cpap',
    '/work',
    '/treatments',
    '/sleep',
    '/correlations',
    '/goals',
    '/timeline',
    '/chart',
    '/data-sources',
    '/dashboards',
  ])
  const keys = new Set(dashboards.map(({ key }) => key))
  for (const dashboard of dashboards) {
    for (const widget of widgetsOf(dashboard).filter(({ type }) => type === 'quick_link')) {
      const href = widget.config.href
      if (href.startsWith('dashboard:')) assert.ok(keys.has(href.slice(10)), href)
      else {
        const url = new URL(href, 'http://localhost')
        assert.equal(url.origin, 'http://localhost')
        assert.ok(paths.has(url.pathname), href)
        if (url.pathname === '/treatments') {
          assert.ok(['today', 'library', 'journal', 'insights'].includes(url.searchParams.get('view')), href)
        }
      }
    }
  }
})

test('daily totals never become hourly output and trends preserve unknown days', () => {
  for (const dashboard of dashboards) {
    for (const widget of widgetsOf(dashboard)) {
      if (widget.type === 'bar_chart') assert.equal(widget.config.bucket_size, '1d')
      if (widget.type === 'trend_chart') assert.equal(widget.config.missing_days, 'skip')
      if (['metric_card', 'sparkline_card'].includes(widget.type)) assert.match(widget.config.title, /mean/)
    }
  }
})

test('reviews are completed calendar periods and omit the live latest-sleep widget', () => {
  for (const dashboard of dashboards) {
    if (['weekly', 'monthly'].includes(dashboard.key)) {
      assert.equal(dashboard.config.period.granularity, dashboard.key === 'weekly' ? 'week' : 'month')
      assert.ok(widgetsOf(dashboard).every(({ type }) => type !== 'last_sleep'))
    } else assert.equal(dashboard.config.period, undefined)
  }
  assert.ok(dashboards[0].config.sections.find(({ id }) => id === 'recent').widgets.length <= 6)
})

test('each build returns independent editable configuration objects', () => {
  const first = buildDashboards()
  first[0].config.sections[0].widgets[0].config.title = 'Edited title'
  assert.notEqual(buildDashboards()[0].config.sections[0].widgets[0].config.title, 'Edited title')
})
