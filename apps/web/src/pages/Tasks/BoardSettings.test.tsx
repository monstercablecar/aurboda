// @vitest-environment jsdom
import type { TaskBoardSettings } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { BoardSettings } from './BoardSettings'
const settings: TaskBoardSettings = {
  updated_at: '2026-11-12T00:00:00Z',
  columns: [
    { id: 'todo', title: 'To do', status: 'todo', color: '#64748b', wip_limit: null },
    { id: 'doing', title: 'Doing', status: 'in_progress', color: '#3b82f6', wip_limit: null },
    { id: 'done', title: 'Done', status: 'done', color: '#22c55e', wip_limit: null },
  ],
}
let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
})
const button = (name: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === name)!
function input(selector: string, value: string) {
  act(() => {
    const field = container.querySelector<HTMLInputElement>(selector)!
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
test('invalid task limits explain the problem and prevent saving', () => {
  const save = vi.fn()
  act(() => render(<BoardSettings settings={settings} busy={false} save={save} close={vi.fn()} />, container))
  expect(button('Save columns').disabled).toBe(true)
  input('input[type="number"]', '1.5')
  expect(container.textContent).toContain('whole-number task limit')
  expect(button('Save columns').disabled).toBe(true)
  input('input[type="number"]', '3')
  expect(button('Save columns').disabled).toBe(false)
  act(() => button('Save columns').click())
  expect(save).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ wip_limit: 3 })]),
    settings.updated_at,
  )
})
test('background settings changes cannot replace a draft version until explicit reload', () => {
  const save = vi.fn(),
    close = vi.fn()
  const mount = (value: TaskBoardSettings) =>
    act(() => render(<BoardSettings settings={value} busy={false} save={save} close={close} />, container))
  mount(settings)
  input('input[aria-label="Column 1 title"]', 'Draft')
  const fresh = {
    ...settings,
    updated_at: '2026-11-12T01:00:00Z',
    columns: settings.columns.map((c) => (c.id === 'todo' ? { ...c, title: 'Elsewhere' } : c)),
  }
  mount(fresh)
  expect(container.textContent).toContain('changed in another window')
  act(() => button('Save columns').click())
  expect(save).toHaveBeenLastCalledWith(expect.any(Array), settings.updated_at)
  act(() => button('Reload columns (discard draft)').click())
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Column 1 title"]')?.value).toBe(
    'Elsewhere',
  )
  expect(button('Save columns').disabled).toBe(true)
  input('input[aria-label="Column 1 title"]', 'New draft')
  act(() => button('Save columns').click())
  expect(save).toHaveBeenLastCalledWith(expect.any(Array), fresh.updated_at)
})

test('preserves a full custom board while allowing one additional onboarding column', () => {
  const save = vi.fn()
  const fullBoard = {
    ...settings,
    columns: [
      ...settings.columns,
      ...Array.from({ length: 17 }, (_, index) => ({
        ...settings.columns[0],
        id: `custom-${index}`,
        title: `Custom ${index + 1}`,
      })),
    ],
  }
  act(() =>
    render(<BoardSettings settings={fullBoard} busy={false} save={save} close={vi.fn()} />, container),
  )
  expect(button('Add column').disabled).toBe(false)
  act(() => button('Add column').click())
  expect(button('Add column').disabled).toBe(true)
  input('input[aria-label="Column 21 title"]', 'Onboarding')
  act(() => button('Save columns').click())
  const savedColumns = save.mock.calls[0][0]
  expect(savedColumns).toHaveLength(21)
  expect(savedColumns.slice(0, 20)).toEqual(fullBoard.columns)
  expect(savedColumns[20]).toMatchObject({ title: 'Onboarding', status: 'todo' })
})
