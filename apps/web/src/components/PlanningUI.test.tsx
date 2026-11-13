// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, test, vi } from 'vitest'

vi.mock('../state/api/planning-error', () => ({ planningError: (error: Error) => error.message }))
import { Pagination } from './PlanningUI'
test('can leave a now-empty final page after deleting or completing its last item', () => {
  const container = document.createElement('div')
  const change = vi.fn()
  act(() => render(<Pagination page={2} total={20} change={change} />, container))
  const previous = container.querySelector<HTMLButtonElement>('button')
  expect(previous?.disabled).toBe(false)
  act(() => previous?.click())
  expect(change).toHaveBeenCalledWith(1)
  expect(container.textContent).not.toContain('of 1')
  act(() => render(null, container))
})
