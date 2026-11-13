// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Celebration } from './Celebration'
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  vi.useRealTimers()
})
const props = { icon: '✓', kind: 'quick' as const, title: 'Saved', message: 'Recorded.', duration: 2800 }
it('replaces the timer for a new ID and cleans up on unmount', () => {
  const done = vi.fn()
  act(() => render(<Celebration {...props} id={1} onDone={done} />, container))
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  act(() => render(<Celebration {...props} id={2} onDone={done} />, container))
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(done).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(1800)
  })
  expect(done).toHaveBeenCalledTimes(1)
  act(() => render(<Celebration {...props} id={3} onDone={done} />, container))
  act(() => render(null, container))
  act(() => {
    vi.advanceTimersByTime(5000)
  })
  expect(done).toHaveBeenCalledTimes(1)
})
it('is polite, dismissible, and has a bounded decoration count', () => {
  const done = vi.fn()
  act(() => render(<Celebration {...props} id={1} onDone={done} />, container))
  expect(container.querySelector('[role=status]')?.getAttribute('aria-live')).toBe('polite')
  expect(container.querySelectorAll('i').length).toBeLessThanOrEqual(20)
  act(() => container.querySelector<HTMLButtonElement>('button')!.click())
  expect(done).toHaveBeenCalledOnce()
})
