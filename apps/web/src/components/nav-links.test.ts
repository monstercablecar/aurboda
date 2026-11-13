import { describe, expect, test } from 'vitest'

import { pageTitleForPath } from './nav-links'

describe('pageTitleForPath', () => {
  test('uses the nav label of the current route', () => {
    expect(pageTitleForPath('/')).toBe('Home')
    expect(pageTitleForPath('/timeline')).toBe('Timeline')
    expect(pageTitleForPath('/cpap')).toBe('CPAP')
    expect(pageTitleForPath('/simple-food')).toBe('Simple food')
    expect(pageTitleForPath('/assessments?embed=1')).toBe('Mental assessments')
    expect(pageTitleForPath('/work')).toBe('Work')
    expect(pageTitleForPath('/people?person=123&embed=1')).toBe('PEOPLE')
    expect(pageTitleForPath('/treatments')).toBe('Treatments')
    expect(pageTitleForPath('/resources?embed=1')).toBe('Resources')
    expect(pageTitleForPath('/correlations')).toBe('Analyze')
    expect(pageTitleForPath('/dashboards')).toBe('Dashboards')
    expect(pageTitleForPath('/shared-dashboards')).toBe('Dashboards')
    expect(pageTitleForPath('/data-sources/oura')).toBe('Oura Ring')
  })

  test('drops the "+" from the Add link', () => {
    expect(pageTitleForPath('/add')).toBe('Add')
  })

  test('names pages that are not in the nav', () => {
    expect(pageTitleForPath('/data-sources')).toBe('Data Sources')
    expect(pageTitleForPath('/settings')).toBe('Settings')
    expect(pageTitleForPath('/help')).toBe('Help & support')
  })

  test('ignores the query string, hash and a trailing slash', () => {
    expect(pageTitleForPath('/timeline?date=2026-11-01')).toBe('Timeline')
    expect(pageTitleForPath('/goals#weekly')).toBe('Tasks')
    expect(pageTitleForPath('/meals/')).toBe('Meals')
    expect(pageTitleForPath('/treatments?view=journal&embed=1')).toBe('Treatments')
  })

  test('falls back to the parent section for nested routes', () => {
    expect(pageTitleForPath('/reports/add')).toBe('Reports')
    expect(pageTitleForPath('/meals/123')).toBe('Meals')
    expect(pageTitleForPath('/data-sources/unknown')).toBe('Data Sources')
    expect(pageTitleForPath('/admin/users/maja')).toBe('Admin')
    expect(pageTitleForPath('/treatments/session/123')).toBe('Treatments')
  })

  test('falls back to Aurboda for unknown routes', () => {
    expect(pageTitleForPath('/sleep')).toBe('Aurboda')
    expect(pageTitleForPath('/mealsandmore')).toBe('Aurboda')
  })
})
