import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, test } from 'vitest'

// @vitest-environment jsdom
import type { TimelineNavigation } from './useTimelineNavigation'

import { peopleDateTimelineHref } from './peopleCalendar'

test('future date links and forward navigation work on repeated Timeline visits without reversed history fetches', async () => {
  window.history.replaceState({}, '', peopleDateTimelineHref('2035-05-12'))
  const { useTimelineNavigation } = await import('./useTimelineNavigation')
  let navigation: TimelineNavigation | undefined
  function Navigation() {
    navigation = useTimelineNavigation()
    return <button onClick={() => navigation?.handleJumpDays(1)}>Forward</button>
  }
  const container = document.createElement('div')
  document.body.append(container)
  act(() => render(<Navigation />, container))
  expect(navigation?.effectiveViewStart.toISOString()).toBe('2035-05-12T00:00:00.000Z')
  expect(navigation?.fetchStart.getTime()).toBeLessThan(navigation?.fetchEnd.getTime() ?? 0)
  act(() => container.querySelector('button')?.click())
  expect(navigation?.effectiveViewStart.toISOString()).toBe('2035-05-13T00:00:00.000Z')
  act(() => render(null, container))
  window.history.replaceState({}, '', peopleDateTimelineHref('2036-02-29'))
  act(() => render(<Navigation />, container))
  expect(navigation?.effectiveViewStart.toISOString()).toBe('2036-02-29T00:00:00.000Z')
  expect(navigation?.fromDate.value).toBe(navigation?.toDate.value)
  act(() => render(null, container))
  container.remove()
})
