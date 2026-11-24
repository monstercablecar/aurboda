import { expect, it } from 'vitest'

import { moveSidebarEntry, orderSidebarEntries, savedSidebarOrder, sidebarEntries } from './sidebar-order'

it('orders top-level blocks once, appends newly registered pages, and never sorts group children', () => {
  const defaults = sidebarEntries(true)
  const ordered = orderSidebarEntries(defaults, ['group:sharing', '/work', '/future-page', '/work', '/feed'])
  expect(ordered.map((entry) => entry.key)).toEqual([
    'group:sharing',
    '/work',
    ...defaults.map((entry) => entry.key).filter((key) => !['group:sharing', '/work'].includes(key)),
  ])
  expect(ordered[0].children?.map((child) => child.href)).toEqual(['/feed', '/dashboards', '/challenges'])
  expect(sidebarEntries(false).some((entry) => entry.key === '/admin')).toBe(false)
})
it('moves in both directions and retains unavailable/future preference keys', () => {
  expect(moveSidebarEntry(['/work', 'group:sharing', '/sleep'], '/work', '/sleep')).toEqual([
    'group:sharing',
    '/sleep',
    '/work',
  ])
  expect(moveSidebarEntry(['/work', 'group:sharing', '/sleep'], '/sleep', '/work')).toEqual([
    '/sleep',
    '/work',
    'group:sharing',
  ])
  expect(savedSidebarOrder(['/future', '/admin', '/sleep'], ['/sleep', '/work'])).toEqual([
    '/sleep',
    '/work',
    '/future',
    '/admin',
  ])
})
