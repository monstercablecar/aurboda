import type { TaskItem } from '@aurboda/api-spec'

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({
  getTaskBoard: vi.fn(),
  listProjects: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  planningError: (e: Error) => e.message,
}))
vi.mock('../../state/api/tasks', () => api)
const location = vi.hoisted(() => ({ query: {} as Record<string, string>, route: vi.fn() }))
vi.mock('preact-iso', () => ({ useLocation: () => location }))
vi.mock('./TaskBoard', () => ({ TaskBoard: () => <div>Board content</div> }))
vi.mock('../../state/auth', () => ({ auth: { value: { user: 'alice', token: 'token' } } }))
import { Tasks, TaskEditor } from './index'
import { taskDetailsBody, taskDetailsDraft } from './TaskDetailsFields'
const item: TaskItem = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Book a service',
  description: 'Check available dates',
  project_id: null,
  due_date: '2026-11-12',
  priority: 2,
  done: false,
  workflow_status: 'todo',
  recurrence: null,
  next_occurrence_id: null,
  completed_at: null,
  created_at: '2026-11-12T00:00:00Z',
  updated_at: '2026-11-12T00:00:00Z',
}
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  location.query = {}
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  HTMLDialogElement.prototype.showModal = vi.fn()
  api.getTaskBoard.mockResolvedValue({ success: true, data: { columns: [], updated_at: item.updated_at } })
  api.listProjects.mockResolvedValue({ success: true, data: [], total: 0 })
  api.listTasks.mockResolvedValue({ success: true, data: [item], total: 1 })
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  client.clear()
})
async function mount(node: Parameters<typeof render>[0]) {
  await act(async () => {
    render(<QueryClientProvider client={client}>{node}</QueryClientProvider>, container)
    await new Promise((r) => setTimeout(r, 40))
  })
}
async function tick() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40))
  })
}
test.each([false, true])(
  'completion/reopen sends only the change and current version (done=%s)',
  async (done) => {
    api.listTasks.mockResolvedValue({ success: true, data: [{ ...item, done }], total: 1 })
    api.updateTask.mockResolvedValue({})
    await mount(<Tasks />)
    await tick()
    const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    expect(checkbox.getAttribute('aria-label')).toBe(`${done ? 'Reopen' : 'Complete'} ${item.title}`)
    await act(async () => {
      checkbox.click()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(api.updateTask).toHaveBeenCalledWith(item.id, {
      done: !done,
      expected_updated_at: item.updated_at,
    })
  },
)
test('failed edits preserve entered values and do not dismiss the editor', async () => {
  api.updateTask.mockRejectedValue(new Error('Changed elsewhere'))
  const close = vi.fn()
  await mount(<TaskEditor item={item} projects={[]} close={close} saved={vi.fn()} />)
  const input = container.querySelector<HTMLInputElement>('input')!
  await act(async () => {
    input.value = 'Updated draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 20))
  })
  expect(close).not.toHaveBeenCalled()
  expect(input.value).toBe('Updated draft')
  expect(container.textContent).toContain('Changed elsewhere')
  expect(api.updateTask).toHaveBeenCalledWith(
    item.id,
    expect.objectContaining({ title: 'Updated draft', expected_updated_at: item.updated_at }),
  )
})
test('new tasks use Inbox without creating a health goal', async () => {
  api.createTask.mockResolvedValue({})
  await mount(<TaskEditor projects={[]} close={vi.fn()} saved={vi.fn()} />)
  const input = container.querySelector<HTMLInputElement>('input')!
  await act(async () => {
    input.value = 'Call the plumber'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 20))
  })
  expect(api.createTask).toHaveBeenCalledWith({
    title: 'Call the plumber',
    description: '',
    project_id: null,
    due_date: null,
    priority: 0,
    workflow_status: 'todo',
    recurrence: null,
    labels: [],
    checklist: [],
    custom_fields: [],
    blocked_reason: '',
    archived: false,
  })
})
function control<T extends HTMLElement>(label: string, selector: string): T {
  const element = Array.from(container.querySelectorAll('label'))
    .find((node) => node.textContent?.trim().startsWith(label))
    ?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${label}`)
  return element
}
async function changeRepeat(value: string) {
  await act(async () => {
    const select = control<HTMLSelectElement>('Repeat', 'select')
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function submitEditor() {
  await act(async () => {
    const form = container.querySelector('form')
    if (!form) throw new Error('Missing form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
test.each(['daily', 'weekly', 'monthly'])(
  'creates a %s task with an editable default due date',
  async (recurrence) => {
    api.createTask.mockResolvedValue({})
    await mount(<TaskEditor projects={[]} close={vi.fn()} saved={vi.fn()} />)
    await act(async () => {
      const title = control<HTMLInputElement>('Task title', 'input')
      title.value = 'Water the plants'
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await changeRepeat(recurrence)
    const due = control<HTMLInputElement>('Due date', 'input')
    expect(due.required).toBe(true)
    expect(due.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await act(async () => {
      due.value = '2027-01-31'
      due.dispatchEvent(new Event('input', { bubbles: true }))
    })
    if (recurrence === 'monthly') expect(container.textContent).toContain('last day of a shorter month')
    expect(container.textContent).toContain('Late completions may create an overdue next task')
    await submitEditor()
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence, due_date: '2027-01-31', workflow_status: 'todo' }),
    )
  },
)
test('turning repeat off sends explicit null and keeps the due date', async () => {
  api.updateTask.mockResolvedValue({})
  await mount(
    <TaskEditor item={{ ...item, recurrence: 'weekly' }} projects={[]} close={vi.fn()} saved={vi.fn()} />,
  )
  await changeRepeat('')
  expect(control<HTMLInputElement>('Due date', 'input').required).toBe(false)
  await submitEditor()
  expect(api.updateTask).toHaveBeenCalledWith(
    item.id,
    expect.objectContaining({ recurrence: null, due_date: item.due_date }),
  )
})
test('repeating editor refuses missing due date and initially completed creation', async () => {
  await mount(<TaskEditor projects={[]} close={vi.fn()} saved={vi.fn()} />)
  await changeRepeat('daily')
  await act(async () => {
    const due = control<HTMLInputElement>('Due date', 'input')
    due.value = ''
    due.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await submitEditor()
  expect(container.textContent).toContain('Choose a due date')
  expect(api.createTask).not.toHaveBeenCalled()
  await act(async () => {
    const due = control<HTMLInputElement>('Due date', 'input')
    due.value = '2027-01-01'
    due.dispatchEvent(new Event('input', { bubbles: true }))
    const status = control<HTMLSelectElement>('Status', 'select')
    status.value = 'done'
    status.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await submitEditor()
  expect(container.textContent).toContain('Start a repeating task in To do or In progress')
  expect(api.createTask).not.toHaveBeenCalled()
})
test('completed occurrence explains that changing it does not alter the upcoming task', async () => {
  await mount(
    <TaskEditor
      item={{
        ...item,
        recurrence: 'monthly',
        done: true,
        workflow_status: 'done',
        next_occurrence_id: '22222222-2222-4222-8222-222222222222',
      }}
      projects={[]}
      close={vi.fn()}
      saved={vi.fn()}
    />,
  )
  expect(container.textContent).toContain(
    'Editing or completing this task again will not change it or create another',
  )
})
test('list completion refreshes and displays the next recurring task', async () => {
  let completed = false
  api.listTasks.mockImplementation(async () => ({
    success: true,
    total: 1,
    data: [
      completed
        ? {
            ...item,
            id: '22222222-2222-4222-8222-222222222222',
            title: 'Next water plants',
            recurrence: 'daily',
          }
        : { ...item, recurrence: 'daily' },
    ],
  }))
  api.updateTask.mockImplementation(async () => {
    completed = true
    return {}
  })
  await mount(<Tasks />)
  await tick()
  expect(container.querySelector('.task-recurrence-badge')?.textContent).toContain('Daily')
  await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]')?.click())
  await tick()
  await tick()
  expect(container.textContent).toContain('Next water plants')
  expect(api.updateTask).toHaveBeenCalledTimes(1)
})

test('rich metadata survives editing and custom columns determine the completion category', async () => {
  const metadata = {
    labels: ['home', 'planning'],
    checklist: [{ id: 'stable-id', title: 'Measure space', done: true }],
    custom_fields: [{ name: 'Supplier', value: 'Local shop' }],
    blocked_reason: 'Waiting for a quote',
    archived: true,
    column_id: 'waiting',
    position: 12,
  }
  await mount(
    <TaskEditor
      item={{ ...item, ...metadata }}
      projects={[]}
      columns={[
        { id: 'todo', title: 'Ready', status: 'todo', color: '#64748b', wip_limit: null },
        { id: 'waiting', title: 'Waiting', status: 'in_progress', color: '#3b82f6', wip_limit: null },
      ]}
      close={vi.fn()}
      saved={vi.fn()}
    />,
  )
  expect(control<HTMLSelectElement>('Board column', 'select').value).toBe('waiting')
  await submitEditor()
  expect(api.updateTask).toHaveBeenCalledWith(
    item.id,
    expect.objectContaining({
      labels: metadata.labels,
      checklist: metadata.checklist,
      custom_fields: metadata.custom_fields,
      blocked_reason: metadata.blocked_reason,
      archived: true,
      column_id: 'waiting',
      workflow_status: 'in_progress',
    }),
  )
  // Position is omitted from the edit so a concurrent reorder cannot be reset.
  expect(api.updateTask.mock.calls[0][1]).not.toHaveProperty('position')
  await mount(<TaskEditor item={{ ...item, ...metadata }} projects={[]} close={vi.fn()} saved={vi.fn()} />)
  await submitEditor()
  expect(api.updateTask).toHaveBeenLastCalledWith(
    item.id,
    expect.not.objectContaining({ column_id: expect.anything() }),
  )
})

test('labels are trimmed and deduplicated, and invalid label length preserves the draft', async () => {
  const close = vi.fn()
  await mount(<TaskEditor item={item} projects={[]} close={close} saved={vi.fn()} />)
  const input = control<HTMLInputElement>('Labels', 'input')
  await act(async () => {
    input.value = 'a'.repeat(41)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await submitEditor()
  expect(api.updateTask).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  expect(container.textContent).toContain('at most 40 characters')
  await act(async () => {
    input.value = ' home, home, errands, '
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await submitEditor()
  expect(api.updateTask).toHaveBeenCalledWith(
    item.id,
    expect.objectContaining({ labels: ['home', 'errands'] }),
  )
})

test('checklist reorder, toggle and removal preserve stable identifiers', async () => {
  await mount(
    <TaskEditor
      item={{
        ...item,
        checklist: [
          { id: 'one', title: 'First', done: false },
          { id: 'two', title: 'Second', done: false },
        ],
      }}
      projects={[]}
      close={vi.fn()}
      saved={vi.fn()}
    />,
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Move checklist item 2 up"]')!.click(),
  )
  await act(async () =>
    container.querySelector<HTMLInputElement>('[aria-label="Complete checklist item 1"]')!.click(),
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove checklist item 2"]')!.click(),
  )
  await submitEditor()
  expect(api.updateTask).toHaveBeenCalledWith(
    item.id,
    expect.objectContaining({ checklist: [{ id: 'two', title: 'Second', done: true }] }),
  )
})

test('archive selector requests archived records and renders metadata', async () => {
  api.listTasks.mockResolvedValue({
    success: true,
    data: [{ ...item, archived: true, labels: ['home'], blocked_reason: 'Waiting' }],
    total: 1,
  })
  await mount(<Tasks />)
  await tick()
  await act(async () => {
    const select = control<HTMLSelectElement>('Show', 'select')
    select.value = 'archived'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await tick()
  expect(api.listTasks).toHaveBeenLastCalledWith(expect.objectContaining({ archived: 'only', status: 'all' }))
  expect(container.textContent).toContain('Blocked: Waiting')
  expect(container.textContent).toContain('home')
})

test('metadata validation rejects blank checklist titles and duplicate custom field names', () => {
  expect(() =>
    taskDetailsBody({ ...taskDetailsDraft(), checklist: [{ id: 'one', title: '  ', done: false }] }),
  ).toThrow('Give each checklist item a title')
  expect(() =>
    taskDetailsBody({
      ...taskDetailsDraft(),
      custom_fields: [
        { name: 'Supplier', value: 'One' },
        { name: ' Supplier ', value: 'Two' },
      ],
    }),
  ).toThrow('Custom field names must be unique')
})

test('editing an inbox task keeps its project when the surrounding list has a project filter', async () => {
  await mount(
    <TaskEditor
      item={item}
      projectId="22222222-2222-4222-8222-222222222222"
      projects={[]}
      close={vi.fn()}
      saved={vi.fn()}
    />,
  )
  await submitEditor()
  expect(api.updateTask).toHaveBeenCalledWith(item.id, expect.objectContaining({ project_id: null }))
})

test('list uses the configured custom column title', async () => {
  api.getTaskBoard.mockResolvedValue({
    success: true,
    data: {
      columns: [
        {
          id: 'waiting',
          title: 'Waiting for supplies',
          status: 'in_progress',
          color: '#123456',
          wip_limit: null,
        },
      ],
      updated_at: item.updated_at,
    },
  })
  api.listTasks.mockResolvedValue({
    success: true,
    data: [{ ...item, column_id: 'waiting', workflow_status: 'in_progress' }],
    total: 1,
  })
  await mount(<Tasks />)
  await tick()
  expect(container.querySelector('.task-status-badge')?.textContent).toContain('Waiting for supplies')
})

test('new editor focuses the title and keeps optional details collapsed', async () => {
  await mount(<TaskEditor projects={[]} close={vi.fn()} saved={vi.fn()} />)
  expect(document.activeElement).toBe(control<HTMLInputElement>('Task title', 'input'))
  const sections = Array.from(container.querySelectorAll('details'))
  expect(sections).toHaveLength(2)
  expect(sections.every((section) => !section.open)).toBe(true)
  expect(container.querySelector('fieldset')?.textContent).toContain('Add checklist item')
  await act(async () => {
    sections[1].open = true
    sections[1].dispatchEvent(new Event('toggle'))
  })
  expect(control<HTMLInputElement>('Labels', 'input')).toBeTruthy()
})

test('populated optional sections open so existing values remain discoverable', async () => {
  await mount(
    <TaskEditor
      item={{ ...item, recurrence: 'weekly', labels: ['home'] }}
      projects={[]}
      close={vi.fn()}
      saved={vi.fn()}
    />,
  )
  expect(Array.from(container.querySelectorAll('details')).every((section) => section.open)).toBe(true)
  expect(control<HTMLInputElement>('Labels', 'input').value).toBe('home')
  expect(control<HTMLSelectElement>('Repeat', 'select').value).toBe('weekly')
})

test.each(['ctrlKey', 'metaKey'])(
  'save shortcut validates and locks editor until a failed save returns (%s)',
  async (modifier) => {
    let rejectSave: (error: Error) => void = () => {}
    api.updateTask.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject
        }),
    )
    const close = vi.fn()
    await mount(<TaskEditor item={item} projects={[]} close={close} saved={vi.fn()} />)
    await act(async () => {
      control<HTMLInputElement>('Task title', 'input').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', [modifier]: true, bubbles: true, cancelable: true }),
      )
    })
    expect(api.updateTask).toHaveBeenCalledTimes(1)
    expect(container.querySelector<HTMLFieldSetElement>('.task-editor-controls')?.disabled).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Saving')
    await act(async () => {
      rejectSave(new Error('Please try again'))
      await Promise.resolve()
    })
    expect(container.querySelector<HTMLFieldSetElement>('.task-editor-controls')?.disabled).toBe(false)
    expect(control<HTMLInputElement>('Task title', 'input').value).toBe(item.title)
    expect(close).not.toHaveBeenCalled()
  },
)

test('board shell stays compact and retains the view route and clear project filter', async () => {
  location.query = { view: 'board' }
  await mount(<Tasks />)
  expect(container.querySelector('.tasks-board-mode h2')?.textContent).toBe('Task board')
  expect(container.textContent).not.toContain('Make space for what matters')
  expect(container.querySelector('input[type="search"]')?.getAttribute('placeholder')).toBe('Find a task…')
  expect(control<HTMLSelectElement>('Filter by project', 'select').selectedOptions[0].textContent).toBe(
    'All projects and Inbox',
  )
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLButtonElement>('.task-view-switch button'))
      .find((button) => button.textContent === 'List')
      ?.click()
  })
  expect(location.route).toHaveBeenCalledWith('/goals?view=list')
})

test('validation reveals a collapsed section containing an invalid field', async () => {
  await mount(<TaskEditor projects={[]} close={vi.fn()} saved={vi.fn()} />)
  const details = Array.from(container.querySelectorAll('details')).find((node) =>
    node.textContent?.includes('More details'),
  )!
  const field = details.querySelector('input')!
  expect(details.open).toBe(false)
  await act(async () => {
    field.dispatchEvent(new Event('invalid', { bubbles: false, cancelable: true }))
  })
  expect(details.open).toBe(true)
})
