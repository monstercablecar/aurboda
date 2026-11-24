import type { DashboardConfig, DashboardWidget } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import { isResolvedFor, isShownToVisitors, sanitizeConfig } from './dashboard-config.ts'

describe('sanitizeConfig', () => {
  test('neutralizes quick-link hrefs and leaves other widgets untouched', () => {
    const config: DashboardConfig = {
      sections: [
        {
          id: 's1',
          title: 'Links',
          type: 'links',
          widgets: [
            {
              config: { href: '/secret/admin', icon: 'goals', label: 'Goals' },
              id: 'ql',
              type: 'quick_link',
            },
            { config: { metric: 'hrv_7day', title: 'HRV' }, id: 'mc', type: 'metric_card' },
          ],
        },
      ],
      version: 1,
    }

    const sanitized = sanitizeConfig(config)
    const [quickLink, metricCard] = sanitized.sections[0].widgets

    expect(quickLink.type).toBe('quick_link')
    if (quickLink.type === 'quick_link') {
      expect(quickLink.config.href).toBe('#')
      expect(quickLink.config.label).toBe('Goals') // label preserved
    }
    expect(metricCard).toEqual(config.sections[0].widgets[1]) // untouched
    // Original config is not mutated.
    expect(config.sections[0].widgets[0]).toMatchObject({ config: { href: '/secret/admin' } })
  })

  test('preserves author prose (dashboard + section descriptions)', () => {
    const config: DashboardConfig = {
      description: 'Two years of training.',
      sections: [
        { description: 'Recovery metrics.', id: 's1', title: 'Baseline', type: 'metrics', widgets: [] },
      ],
      version: 1,
    }
    const sanitized = sanitizeConfig(config)
    expect(sanitized.description).toBe('Two years of training.')
    expect(sanitized.sections[0].description).toBe('Recovery metrics.')
  })

  test('keeps the period of a period dashboard', () => {
    const config: DashboardConfig = { period: { granularity: 'month' }, sections: [], version: 1 }
    expect(sanitizeConfig(config).period).toEqual({ granularity: 'month' })
    expect('period' in sanitizeConfig({ sections: [], version: 1 })).toBe(false)
  })

  test('leaves out a day overview unless the owner showed it to visitors', () => {
    const day = (id: string, visible_to_visitors?: boolean): DashboardWidget => ({
      config: {
        metrics: ['stress_level', 'body_battery'],
        window: 'rolling_24h',
        ...(visible_to_visitors === undefined ? {} : { visible_to_visitors }),
      },
      id,
      type: 'day_overview',
    })
    const config: DashboardConfig = {
      sections: [
        {
          id: 's1',
          title: 'Today',
          type: 'charts',
          widgets: [
            day('unset'),
            day('off', false),
            day('on', true),
            { config: { metric: 'hrv_7day', title: 'HRV' }, id: 'mc', type: 'metric_card' },
          ],
        },
      ],
      version: 1,
    }
    expect(sanitizeConfig(config).sections[0].widgets.map((w) => w.id)).toEqual(['on', 'mc'])
    expect(config.sections[0].widgets.filter(isShownToVisitors).map((w) => w.id)).toEqual(['on', 'mc'])
  })
})

describe('latest activities visibility', () => {
  const recent = (id: string, visible_to_visitors?: boolean): DashboardWidget => ({
    config: {
      limit: 5,
      window: 'today',
      ...(visible_to_visitors === undefined ? {} : { visible_to_visitors }),
    },
    id,
    type: 'recent_activities',
  })
  const day: DashboardWidget = {
    config: { metrics: ['stress_level'], window: 'today' },
    id: 'day',
    type: 'day_overview',
  }
  const metric: DashboardWidget = {
    config: { metric: 'hrv_7day', title: 'HRV' },
    id: 'mc',
    type: 'metric_card',
  }

  test('isShownToVisitors needs visible_to_visitors', () => {
    expect(isShownToVisitors(recent('unset'))).toBe(false)
    expect(isShownToVisitors(recent('off', false))).toBe(false)
    expect(isShownToVisitors(recent('on', true))).toBe(true)
  })

  test('isResolvedFor always resolves the card for the owner, never a day overview without its flag', () => {
    expect(isResolvedFor(recent('unset'), 'owner')).toBe(true)
    expect(isResolvedFor(recent('unset'), 'visitor')).toBe(false)
    expect(isResolvedFor(recent('on', true), 'visitor')).toBe(true)
    expect(isResolvedFor(day, 'owner')).toBe(false)
    expect(isResolvedFor(metric, 'visitor')).toBe(true)
  })

  test('sanitizeConfig leaves the card out unless shown to visitors', () => {
    const config: DashboardConfig = {
      sections: [
        {
          id: 's1',
          title: 'Today',
          type: 'charts',
          widgets: [recent('unset'), recent('off', false), recent('on', true), metric],
        },
      ],
      version: 1,
    }
    expect(sanitizeConfig(config).sections[0].widgets.map((w) => w.id)).toEqual(['on', 'mc'])
  })
})
