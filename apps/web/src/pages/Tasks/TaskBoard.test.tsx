// @vitest-environment jsdom
import type { TaskItem } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({
  listTasks: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  getTaskBoard: vi.fn(),
  updateTaskBoard: vi.fn(),
}))
const session = vi.hoisted(() => ({ value: { user: 'alice', token: 'token' } }))
vi.mock('../../state/api/tasks', () => api)
vi.mock('../../state/auth', () => ({ auth: session }))
import { TaskBoard } from './TaskBoard'
let container: HTMLDivElement
let client: QueryClient
const item: TaskItem = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Book a service',
  description: 'Check dates',
  project_id: null,
  due_date: null,
  priority: 2,
  done: false,
  workflow_status: 'todo',
  recurrence: null,
  next_occurrence_id: null,
  completed_at: null,
  created_at: '2026-11-12T00:00:00Z',
  updated_at: '2026-11-12T00:00:00Z',
}
beforeEach(() => {
  vi.clearAllMocks()
  session.value = { user: 'alice', token: 'token' }
  api.getTaskBoard.mockResolvedValue({
    success: true,
    data: {
      updated_at: item.updated_at,
      columns: [
        { id: 'todo', title: 'To do', status: 'todo', color: '#64748b', wip_limit: null },
        { id: 'in_progress', title: 'In progress', status: 'in_progress', color: '#3b82f6', wip_limit: null },
        { id: 'done', title: 'Done', status: 'done', color: '#22c55e', wip_limit: null },
      ],
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  api.listTasks.mockImplementation(async (params) => ({
    success: true,
    data: params.column_id === 'todo' ? [item] : [],
    total: params.column_id === 'todo' ? 1 : 0,
  }))
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  client.clear()
})
async function wait() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 35))
  })
}
async function mount(project = '', search = '') {
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <TaskBoard project={project} search={search} projects={[]} canEdit edit={vi.fn()} remove={vi.fn()} />
      </QueryClientProvider>,
      container,
    )
    await new Promise((resolve) => setTimeout(resolve, 35))
  })
  await wait()
  await wait()
}
function element<T extends Element>(selector: string) {
  const node = container.querySelector<T>(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}
async function drag(selector: string, type: string) {
  await act(async () => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: () => 'attacker-supplied-id' },
    })
    element(selector).dispatchEvent(event)
  })
}
test('each column queries its own status, project/search and real count with independent pagination', async () => {
  api.listTasks.mockImplementation(async (params) => ({
    success: true,
    data:
      params.column_id === 'todo'
        ? [{ ...item, title: params.page === 2 ? 'Page two task' : item.title }]
        : [],
    total: params.column_id === 'todo' ? 21 : 0,
  }))
  await mount('project-a', 'service')
  for (const status of ['todo', 'in_progress', 'done']) {
    expect(api.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-a',
        search: 'service',
        status: 'all',
        column_id: status,
        page: 1,
        per_page: 20,
      }),
    )
  }
  expect(element('[aria-label="To do column"]').textContent).toContain('21')
  const next = Array.from(element('[aria-label="To do column"]').querySelectorAll('button')).find(
    (b) => b.textContent === 'Next',
  )
  if (!next) throw new Error('Missing Next')
  await act(async () => next.click())
  await wait()
  await wait()
  expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ column_id: 'todo', page: 2 }))
  expect(element('[aria-label="To do column"]').textContent).toContain('Page two task')
  expect(api.listTasks.mock.calls.filter(([q]) => q.column_id === 'done')).toHaveLength(2)
})
test('accessible move sends the exact version and blocks a duplicate while awaiting confirmation', async () => {
  let resolve!: () => void
  api.updateTask.mockReturnValue(
    new Promise<void>((r) => {
      resolve = r
    }),
  )
  await mount()
  const select = element<HTMLSelectElement>('[aria-label="Move Book a service to"]')
  await act(async () => {
    select.value = 'in_progress'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(api.updateTask).toHaveBeenCalledWith(item.id, {
    column_id: 'in_progress',
    position: 1024,
    expected_updated_at: item.updated_at,
  })
  expect(select.disabled).toBe(true)
  await act(async () => {
    select.value = 'done'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(api.updateTask).toHaveBeenCalledTimes(1)
  await act(async () => resolve())
  await wait()
  expect(element('.task-board-announcement').textContent).toContain('Moved Book a service to In progress')
})
test('drag captures source version even if cached task updates before drop and stale moves refetch', async () => {
  api.updateTask.mockRejectedValue(new Error('This task changed. Refresh and try again.'))
  await mount()
  await drag('.task-drag-handle', 'dragstart')
  await act(async () => {
    client.setQueriesData({ queryKey: ['task-items', 'alice', 'board', '', '', 'todo'] }, () => ({
      success: true,
      data: [{ ...item, updated_at: '2026-11-12T01:00:00Z' }],
      total: 1,
    }))
  })
  await wait()
  const calls = api.listTasks.mock.calls.length
  await drag('[aria-label="In progress column"]', 'drop')
  await wait()
  expect(api.updateTask).toHaveBeenCalledWith(item.id, {
    column_id: 'in_progress',
    position: 1024,
    expected_updated_at: item.updated_at,
  })
  expect(container.textContent).toContain('This task changed')
  expect(api.listTasks.mock.calls.length).toBeGreaterThan(calls)
})
test('ignores foreign drag payloads without a local source card', async () => {
  await mount()
  await drag('[aria-label="Done column"]', 'drop')
  expect(api.updateTask).not.toHaveBeenCalled()
})
test('changing filter invalidates a drag before drop', async () => {
  await mount()
  await drag('.task-drag-handle', 'dragstart')
  await mount('new-project')
  await drag('[aria-label="Done column"]', 'drop')
  expect(api.updateTask).not.toHaveBeenCalled()
})
test('old-session completion does not announce or invalidate current-session data', async () => {
  let resolve!: () => void
  api.updateTask.mockReturnValue(
    new Promise<void>((r) => {
      resolve = r
    }),
  )
  await mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await act(async () => {
    const select = element<HTMLSelectElement>('[aria-label="Move Book a service to"]')
    select.value = 'done'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  session.value = { user: 'bob', token: 'different' }
  await mount()
  await act(async () => resolve())
  await wait()
  expect(invalidate).not.toHaveBeenCalled()
  expect(element('.task-board-announcement').textContent).not.toContain('Moved')
})

test('a move finishing after leaving Board still refreshes the same account cache', async () => {
  let resolve!: () => void
  api.updateTask.mockReturnValue(
    new Promise<void>((r) => {
      resolve = r
    }),
  )
  await mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await act(async () => {
    const select = element<HTMLSelectElement>('[aria-label="Move Book a service to"]')
    select.value = 'in_progress'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  act(() => render(null, container))
  await act(async () => resolve())
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['task-items'] })
})

test('completing a repeating card refreshes source history and its next To do occurrence', async () => {
  let completed = false
  const nextId = '22222222-2222-4222-8222-222222222222'
  api.listTasks.mockImplementation(async (params) => {
    const data =
      params.column_id === 'todo'
        ? [
            completed
              ? { ...item, id: nextId, title: 'Next occurrence', recurrence: 'weekly' }
              : { ...item, recurrence: 'weekly' },
          ]
        : params.column_id === 'done' && completed
          ? [
              {
                ...item,
                done: true,
                workflow_status: 'done',
                recurrence: 'weekly',
                next_occurrence_id: nextId,
              },
            ]
          : []
    return { success: true, data, total: data.length }
  })
  api.updateTask.mockImplementation(async () => {
    completed = true
    return {}
  })
  await mount()
  expect(element('[aria-label="To do column"]').textContent).toContain('Weekly')
  await act(async () => {
    const select = element<HTMLSelectElement>('[aria-label="Move Book a service to"]')
    select.value = 'done'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait()
  await wait()
  expect(element('[aria-label="To do column"]').textContent).toContain('Next occurrence')
  expect(element('[aria-label="Done column"]').textContent).toContain('Next occurrence created')
  expect(api.updateTask).toHaveBeenCalledTimes(1)
})

async function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!button) throw new Error(`Missing button ${text}`)
  await act(async () => button.click())
  await wait()
}
test('priority filters server reads while WIP totals remain unfiltered', async () => {
  await mount()
  await act(async () => {
    const select = element<HTMLSelectElement>('[aria-label="Filter priority"]')
    select.value = '3'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait()
  expect(api.listTasks).toHaveBeenCalledWith(
    expect.objectContaining({ column_id: 'todo', priority: 3, sort: 'manual' }),
  )
  expect(api.listTasks).toHaveBeenCalledWith({
    column_id: 'todo',
    status: 'all',
    archived: 'exclude',
    page: 1,
    per_page: 1,
  })
})
test('quick add in Inbox uses null project and explicit column', async () => {
  await mount('inbox')
  await act(async () => {
    const input = element<HTMLInputElement>('[aria-label="New task in To do"]')
    input.value = 'Fresh task'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    element<HTMLFormElement>('.task-board-quick-add').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
  })
  await wait()
  expect(api.createTask).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Fresh task', project_id: null, column_id: 'todo', recurrence: null }),
  )
})
test('board settings save with version and retain draft when save fails', async () => {
  api.updateTaskBoard.mockRejectedValue(new Error('Move tasks first before removing this column.'))
  await mount()
  await clickButton('Board settings')
  await act(async () => {
    const input = element<HTMLInputElement>('[aria-label="Column 1 title"]')
    input.value = 'Ready'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await clickButton('Save columns')
  expect(api.updateTaskBoard).toHaveBeenCalledWith(
    expect.objectContaining({
      expected_updated_at: item.updated_at,
      columns: expect.arrayContaining([expect.objectContaining({ title: 'Ready' })]),
    }),
  )
  expect(container.textContent).toContain('Move tasks first')
  expect(element<HTMLInputElement>('[aria-label="Column 1 title"]').value).toBe('Ready')
})
test('archive and duplicate retain the source Inbox and clear recurrence', async () => {
  await mount('project-a')
  await clickButton('Duplicate')
  expect(api.createTask).toHaveBeenCalledWith(
    expect.objectContaining({ project_id: null, recurrence: null, title: 'Book a service (copy)' }),
  )
  await clickButton('Archive')
  expect(api.updateTask).toHaveBeenCalledWith(item.id, {
    archived: true,
    expected_updated_at: item.updated_at,
  })
})
test('bulk archive reports partial failures and uses every captured version', async () => {
  const second = { ...item, id: 'second', title: 'Second task' }
  api.listTasks.mockImplementation(async (params) => ({
    success: true,
    data: params.column_id === 'todo' ? [item, second] : [],
    total: params.column_id === 'todo' ? 2 : 0,
  }))
  api.updateTask.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Conflict'))
  await mount()
  await clickButton('Select tasks')
  await act(async () => {
    element<HTMLInputElement>('[aria-label="Select Book a service"]').click()
    element<HTMLInputElement>('[aria-label="Select Second task"]').click()
  })
  await clickButton('Archive selected')
  expect(element('.task-board-announcement').textContent).toContain('1 updated; 1 failed')
  expect(api.updateTask).toHaveBeenCalledWith('second', {
    archived: true,
    expected_updated_at: item.updated_at,
  })
})
test('drop between tied positions normalizes with versions rather than silently retaining order', async () => {
  const second = { ...item, id: 'second', title: 'Second task', position: 0 }
  const third = { ...item, id: 'third', title: 'Third task', position: 0 }
  api.listTasks.mockImplementation(async (params) => ({
    success: true,
    data: params.column_id === 'todo' ? [item, second, third] : [],
    total: params.column_id === 'todo' ? 3 : 0,
  }))
  api.updateTask.mockResolvedValue({})
  await mount()
  await drag('[aria-label="Drag Third task"]', 'dragstart')
  await drag('.task-board-card:nth-child(2)', 'drop')
  await wait()
  expect(api.updateTask.mock.calls.map(([id, body]) => [id, body.position])).toEqual([
    [item.id, 1024],
    ['third', 2048],
    ['second', 3072],
  ])
  expect(api.updateTask.mock.calls.every(([, body]) => body.expected_updated_at === item.updated_at)).toBe(
    true,
  )
})

test('settings draft keeps its original version across a background refresh until explicitly reloaded', async () => {
  api.updateTaskBoard.mockResolvedValue({})
  await mount()
  await clickButton('Board settings')
  await act(async () => {
    const input = element<HTMLInputElement>('[aria-label="Column 1 title"]')
    input.value = 'My draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const existing = api.getTaskBoard.mock.results[0]
    const response = await existing.value
    client.setQueryData(['task-board', 'alice'], {
      ...response,
      data: { ...response.data, updated_at: '2026-11-13T00:00:00Z' },
    })
  })
  await wait()
  await clickButton('Save columns')
  expect(api.updateTaskBoard).toHaveBeenCalledWith(
    expect.objectContaining({ expected_updated_at: item.updated_at }),
  )
})

test('completion is separate from explicit selection mode and actions are disclosed', async () => {
  api.updateTask.mockResolvedValue({})
  await mount()
  expect(container.querySelector('[aria-label="Select Book a service"]')).toBeNull()
  expect(element<HTMLDetailsElement>('.task-card-menu').open).toBe(false)
  expect(element('[aria-label="Task actions for Book a service"]')).toBeTruthy()
  await act(async () => element<HTMLInputElement>('[aria-label="Complete Book a service"]').click())
  expect(api.updateTask).toHaveBeenCalledWith(item.id, {
    column_id: 'done',
    expected_updated_at: item.updated_at,
  })
  await clickButton('Select tasks')
  expect(element('[aria-label="Select Book a service"]')).toBeTruthy()
})

test('quick add preserves newer typing and focus while the request completes', async () => {
  let resolve!: () => void
  api.createTask.mockReturnValue(
    new Promise<void>((r) => {
      resolve = r
    }),
  )
  await mount()
  const input = element<HTMLInputElement>('[aria-label="New task in To do"]')
  await act(async () => {
    input.focus()
    input.value = 'First task'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    element<HTMLFormElement>('.task-board-quick-add').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
  })
  await act(async () => {
    input.value = 'Second task'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    resolve()
  })
  await wait()
  expect(input.value).toBe('Second task')
  expect(document.activeElement).toBe(input)
})

test('filter changes retain quick add draft and column collapse state with removable chips', async () => {
  await mount()
  const input = element<HTMLInputElement>('[aria-label="New task in To do"]')
  await act(async () => {
    input.value = 'Draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    element<HTMLButtonElement>('[aria-label="Collapse Done"]').click()
    const select = element<HTMLSelectElement>('[aria-label="Filter priority"]')
    select.value = '3'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait()
  expect(element<HTMLInputElement>('[aria-label="New task in To do"]').value).toBe('Draft')
  expect(element('[aria-label="Expand Done"]')).toBeTruthy()
  await act(async () => element<HTMLButtonElement>('[aria-label="Remove priority filter"]').click())
  await wait()
  expect(element<HTMLSelectElement>('[aria-label="Filter priority"]').value).toBe('')
})

test('drag highlights destination and clears on cancellation', async () => {
  await mount()
  await drag('.task-drag-handle', 'dragstart')
  await drag('[aria-label="Done column"]', 'dragover')
  expect(element('[aria-label="Done column"]').classList.contains('is-drop-target')).toBe(true)
  await drag('.task-drag-handle', 'dragend')
  expect(container.querySelector('.is-drop-target')).toBeNull()
})

test('failed completion recovers controls and the captured version prevents duplicate pending writes', async () => {
  let reject!: (error: Error) => void
  api.updateTask.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail
    }),
  )
  await mount()
  const checkbox = element<HTMLInputElement>('[aria-label="Complete Book a service"]')
  await act(async () => {
    checkbox.click()
  })
  expect(checkbox.disabled).toBe(true)
  expect(checkbox.checked).toBe(true)
  await act(async () => {
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(api.updateTask).toHaveBeenCalledTimes(1)
  await act(async () => {
    reject(new Error('Could not save task'))
  })
  await wait()
  expect(checkbox.disabled).toBe(false)
  expect(checkbox.checked).toBe(false)
  expect(container.textContent).toContain('Could not save task')
})

test('empty final page clamps to the previous page after a background refresh', async () => {
  let total = 21
  api.listTasks.mockImplementation(async (params) => ({
    success: true,
    data: params.column_id === 'todo' && (params.page === 1 || total === 21) ? [item] : [],
    total: params.column_id === 'todo' ? total : 0,
  }))
  await mount()
  await clickButton('Next')
  total = 20
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['task-items'] })
  })
  await wait()
  await wait()
  expect(api.listTasks).toHaveBeenLastCalledWith(expect.objectContaining({ column_id: 'todo', page: 1 }))
  expect(element('[aria-label="To do column"]').textContent).toContain(item.title)
})

test('completion stays checked throughout a delayed write and reconciles the server response', async () => {
  let resolve!: (response: unknown) => void
  api.updateTask.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  await mount()
  const checkbox = element<HTMLInputElement>('[aria-label="Complete Book a service"]')
  await act(async () => {
    checkbox.click()
  })
  await wait()
  expect(checkbox.checked).toBe(true)
  expect(checkbox.disabled).toBe(true)
  const completed = {
    ...item,
    done: true,
    workflow_status: 'done',
    column_id: 'done',
    updated_at: '2026-11-13T00:00:00Z',
  }
  api.listTasks.mockImplementation(async (params) => ({
    success: true,
    data: params.column_id === 'done' ? [completed] : [],
    total: params.column_id === 'done' ? 1 : 0,
  }))
  await act(async () => {
    resolve({ success: true, data: completed })
  })
  await wait()
  expect(element<HTMLInputElement>('[aria-label="Reopen Book a service"]').checked).toBe(true)
})
