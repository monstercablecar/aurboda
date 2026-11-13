import { describe, expect, it } from 'vitest'

import { featurePages, isPageVisible, pageKey, setPageVisibility } from './feature-control'
import { DATA_SOURCE_LINKS, NAV_LINKS_PRIMARY, NAV_LINKS_SECONDARY, SHARING_LINKS } from './nav-links'

describe('feature page discovery and visibility', () => {
  it('automatically includes every current navigation entry and restricts Admin to admins', () => {
    const pages = featurePages(false).map((page) => page.href)
    for (const link of [...NAV_LINKS_PRIMARY, ...NAV_LINKS_SECONDARY, ...SHARING_LINKS]) {
      expect(pages).toContain(link.href)
    }
    for (const link of DATA_SOURCE_LINKS) expect(pages).toContain(link.path)
    expect(pages).toContain('/help')
    expect(pages).toContain('/settings')
    expect(pages).not.toContain('/admin')
    expect(featurePages(true).map((page) => page.href)).toContain('/admin')
  })
  it('discovers a new page without any description or feature registration', () => {
    NAV_LINKS_PRIMARY.push({ href: '/new-test-page', label: 'New page' })
    try {
      expect(featurePages(false).some((page) => page.href === '/new-test-page')).toBe(true)
      expect(isPageVisible('/new-test-page', ['/old-unknown-page'])).toBe(true)
      expect(isPageVisible('/new-test-page', setPageVisibility([], '/new-test-page', false))).toBe(false)
    } finally {
      NAV_LINKS_PRIMARY.pop()
    }
  })
  it('normalizes menu keys, keeps Settings reachable and preserves unknown preferences', () => {
    expect(pageKey('/work/?view=day#top')).toBe('/work')
    expect(isPageVisible('/work', ['/work/'])).toBe(false)
    expect(isPageVisible('/settings', ['/settings'])).toBe(true)
    expect(setPageVisibility(['/future', '/work'], '/work', true)).toEqual(['/future'])
    expect(setPageVisibility(['/future'], '/settings', false)).toEqual(['/future'])
    expect(isPageVisible('/')).toBe(true)
  })
})
