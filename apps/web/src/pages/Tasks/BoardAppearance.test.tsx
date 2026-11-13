// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { BoardAppearance } from './BoardAppearance'

let container: HTMLDivElement
const key = (user: string) => `task-board-appearance:${JSON.stringify(user)}`
beforeEach(() => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const storage = frame.contentWindow!.localStorage
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('Storage', storage.constructor)
  frame.remove()
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount(user = 'alice') {
  act(() =>
    render(
      <BoardAppearance key={user} user={user} busy={true}>
        <p class="task-board-description">Description</p>
      </BoardAppearance>,
      container,
    ),
  )
}
function select(index: number, value: string) {
  act(() => {
    const control = container.querySelectorAll('select')[index]
    control.value = value
    control.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const board = () => container.querySelector<HTMLElement>('.board-appearance')!

test('defaults preserve presentation, forward busy state, and do not write on mount', () => {
  const save = vi.spyOn(Storage.prototype, 'setItem')
  mount()
  expect(board().dataset).toMatchObject({ density: 'comfortable', accent: 'default', descriptions: 'show' })
  expect(board().getAttribute('aria-busy')).toBe('true')
  expect(container.querySelector('details')?.open).toBe(false)
  expect(container.textContent).toContain('Saved for this account in this browser')
  expect(save).not.toHaveBeenCalled()
})

test('controls save only appearance and reset defaults', () => {
  mount()
  select(0, 'compact')
  select(1, 'violet')
  act(() => container.querySelector<HTMLInputElement>('input')!.click())
  expect(board().dataset).toMatchObject({ density: 'compact', accent: 'violet', descriptions: 'hide' })
  expect(JSON.parse(localStorage.getItem(key('alice'))!)).toEqual({
    density: 'compact',
    accent: 'violet',
    showDescriptions: false,
  })
  act(() => container.querySelector<HTMLButtonElement>('button')!.click())
  expect(board().dataset).toMatchObject({ density: 'comfortable', accent: 'default', descriptions: 'show' })
  expect(JSON.parse(localStorage.getItem(key('alice'))!).showDescriptions).toBe(true)
})

test('remounting for another account reads isolated preferences without overwriting them', () => {
  const other = 'bob:with/"quotes'
  localStorage.setItem(
    key(other),
    JSON.stringify({ density: 'comfortable', accent: 'amber', showDescriptions: false }),
  )
  mount()
  select(0, 'compact')
  select(1, 'teal')
  const save = vi.spyOn(Storage.prototype, 'setItem')
  mount(other)
  expect(board().dataset).toMatchObject({ density: 'comfortable', accent: 'amber', descriptions: 'hide' })
  expect(save).not.toHaveBeenCalled()
  mount()
  expect(board().dataset).toMatchObject({ density: 'compact', accent: 'teal', descriptions: 'show' })
})

test('malformed or blocked storage falls back safely and blocked writes remain usable', () => {
  for (const value of [
    '{',
    'null',
    '[]',
    '{"density":"compact","accent":"__proto__","showDescriptions":true}',
    '{"density":"dense","accent":"teal","showDescriptions":true}',
    '{"density":"compact","accent":"teal","showDescriptions":"false"}',
  ]) {
    localStorage.setItem(key(value), value)
    mount(value)
    expect(board().dataset).toMatchObject({ density: 'comfortable', accent: 'default', descriptions: 'show' })
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  mount()
  select(0, 'compact')
  expect(board().dataset.density).toBe('compact')
  expect(container.textContent).toContain('Could not save in this browser')
})
