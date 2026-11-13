import type {
  TaskItem,
  TaskItemsResponse,
  TaskProject,
  TaskBoardColumn,
  UpdateTaskItemBody,
} from '@aurboda/api-spec'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'

import { localDate, Pagination, PlanningError, prettyDate } from '../../components/PlanningUI'
import * as api from '../../state/api/tasks'
import { auth } from '../../state/auth'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { columnOf, defaultFilters, positionBefore, readViews, type BoardFilters } from './board-model'
import { BoardAppearance } from './BoardAppearance'
import { BoardSettings } from './BoardSettings'
import { TaskRecurrenceBadge } from './TaskRecurrenceBadge'
import './TaskBoard.css'

function duplicateDetails(source: TaskItem) {
  return {
    description: source.description,
    due_date: source.due_date,
    priority: source.priority,
    labels: source.labels ?? [],
    checklist: source.checklist?.map((c) => ({ ...c, done: false })) ?? [],
    custom_fields: source.custom_fields ?? [],
  }
}
type TaskPatch = Omit<UpdateTaskItemBody, 'expected_updated_at'>
type Actions = {
  busy: boolean
  dragging: string
  selecting: boolean
  dragOver: string
  setDragOver: (target: string) => void
  columns: TaskBoardColumn[]
  selected: Map<string, TaskItem>
  select: (item: TaskItem) => void
  startDrag: (item: TaskItem) => boolean
  endDrag: () => void
  drop: (column: string, items: TaskItem[], target?: TaskItem) => void
  move: (item: TaskItem, column: string) => void
  reorder: (item: TaskItem, column: string, target?: TaskItem, after?: boolean) => void
  update: (item: TaskItem, body: TaskPatch, message: string) => Promise<boolean>
  create: (title: string, column: string, source?: TaskItem) => Promise<boolean>
  edit: (item: TaskItem) => void
  remove: (item: TaskItem) => void
}
function CardMetadata({ item }: { item: TaskItem }) {
  const checklist = item.checklist ?? []
  return (
    <>
      <div class="task-board-meta">
        <TaskRecurrenceBadge item={item} />
        {item.priority > 0 && <span>{['None', 'Low', 'Medium', 'High'][item.priority]} priority</span>}
        <CardDue item={item} />
        {(item.labels ?? []).map((label) => (
          <span class="task-board-label" key={label}>
            {label}
          </span>
        ))}
        {checklist.length > 0 && (
          <span>
            {checklist.filter((c) => c.done).length}/{checklist.length} checklist
          </span>
        )}
        {item.archived && <span>Archived</span>}
      </div>
      {item.blocked_reason && <p class="task-board-blocked">Blocked · {item.blocked_reason}</p>}
      <dl class="task-board-custom-fields">
        {(item.custom_fields ?? []).map((f) => (
          <div key={f.name}>
            <dt>{f.name}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
function CardDue({ item }: { item: TaskItem }) {
  if (!item.due_date) return null
  const overdue = !item.done && item.due_date < localDate()
  const today = !item.done && item.due_date === localDate()
  return (
    <span class={overdue || today ? 'planning-overdue' : ''}>
      {overdue ? 'Overdue · ' : today ? 'Due today · ' : ''}
      {prettyDate(item.due_date)}
    </span>
  )
}
function displayedDone(pending: boolean | null, saved: boolean) {
  return pending ?? saved
}
function BoardCard({
  item,
  index,
  items,
  column,
  actions,
  projects,
  canEdit,
  filters,
}: {
  item: TaskItem
  index: number
  items: TaskItem[]
  column: TaskBoardColumn
  actions: Actions
  projects: TaskProject[]
  canEdit: boolean
  filters: BoardFilters
}) {
  const [pendingDone, setPendingDone] = useState<boolean | null>(null)
  useEffect(() => setPendingDone(null), [item.done, item.updated_at])
  const toggleDone = async () => {
    const next = !item.done
    setPendingDone(next)
    const saved = await actions.update(
      item,
      { column_id: actions.columns.find((c) => c.status === (next ? 'done' : 'todo'))?.id },
      next ? 'Task completed.' : 'Task reopened.',
    )
    if (!saved) setPendingDone(null)
  }
  return (
    <li
      class={`task-board-card${actions.dragging === item.id ? ' is-dragging' : ''}${actions.dragOver === item.id ? ' is-insert-target' : ''}`}
      onDragOver={(e) => {
        if (actions.dragging && !actions.busy && filters.sort === 'manual' && actions.dragging !== item.id) {
          e.preventDefault()
          e.stopPropagation()
          actions.setDragOver(item.id)
        }
      }}
      onDrop={(e) => {
        if (filters.sort === 'manual') {
          e.preventDefault()
          e.stopPropagation()
          actions.drop(column.id, items, item)
        }
      }}
    >
      <div class="task-board-card-top">
        <label>
          {actions.selecting && (
            <input
              type="checkbox"
              aria-label={`Select ${item.title}`}
              checked={actions.selected.has(item.id)}
              disabled={actions.busy}
              onChange={() => actions.select(item)}
            />
          )}
          <span class="task-board-project">
            {projects.find((p) => p.id === item.project_id)?.title ?? 'Inbox'}
          </span>
        </label>
        <button
          class="task-drag-handle"
          draggable={!actions.busy}
          disabled={actions.busy}
          aria-label={`Drag ${item.title}`}
          onDragStart={(e) => {
            if (!e.dataTransfer || !actions.startDrag(item)) {
              e.preventDefault()
              return
            }
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', item.id)
          }}
          onDragEnd={actions.endDrag}
        >
          ⠿
        </button>
      </div>
      <div class="task-board-title-row">
        {!actions.selecting && (
          <input
            type="checkbox"
            checked={displayedDone(pendingDone, item.done)}
            disabled={actions.busy}
            aria-label={`${item.done ? 'Reopen' : 'Complete'} ${item.title}`}
            onChange={() => void toggleDone()}
          />
        )}
        <h4>
          <button
            class="task-board-title"
            disabled={actions.busy || !canEdit}
            onClick={() => actions.edit(item)}
          >
            {item.title}
          </button>
        </h4>
      </div>
      {item.description && <p class="task-board-description">{item.description}</p>}
      <CardMetadata item={item} />
      <details class="task-card-menu">
        <summary aria-label={`Task actions for ${item.title}`}>•••</summary>
        <label class="task-move-label">
          Move to
          <select
            aria-label={`Move ${item.title} to`}
            value={columnOf(item, actions.columns)}
            disabled={actions.busy}
            onChange={(e) => actions.move(item, e.currentTarget.value)}
          >
            {actions.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <div class="task-board-card-actions">
          {filters.sort === 'manual' && (
            <>
              <button
                aria-label={`Move ${item.title} up`}
                disabled={actions.busy || index === 0}
                onClick={() => actions.reorder(item, column.id, items[index - 1])}
              >
                ↑
              </button>
              <button
                aria-label={`Move ${item.title} down`}
                disabled={actions.busy || index === items.length - 1}
                onClick={() => actions.reorder(item, column.id, items[index + 1], true)}
              >
                ↓
              </button>
            </>
          )}
          <button disabled={actions.busy || !canEdit} onClick={() => actions.edit(item)}>
            Edit
          </button>
          <button
            disabled={actions.busy}
            onClick={() =>
              void actions.create(
                `${item.title} (copy)`.slice(0, 255),
                actions.columns.find((c) => c.status === 'todo')?.id ?? column.id,
                item,
              )
            }
          >
            Duplicate
          </button>
          <button
            disabled={actions.busy}
            onClick={() =>
              actions.update(
                item,
                { archived: !item.archived },
                item.archived ? 'Task restored.' : 'Task archived.',
              )
            }
          >
            {item.archived ? 'Restore' : 'Archive'}
          </button>
          <button
            disabled={actions.busy}
            aria-label={`Delete ${item.title}`}
            onClick={() => actions.remove(item)}
          >
            Delete
          </button>
        </div>
      </details>
    </li>
  )
}
function ColumnHeader({
  column,
  collapsed,
  setCollapsed,
  count,
  total,
}: {
  column: TaskBoardColumn
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  count?: number
  total?: number
}) {
  const over = count !== undefined && column.wip_limit !== null && count > column.wip_limit
  return (
    <>
      <header class="task-board-column-header">
        <h3>
          <button
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${column.title}`}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {column.title}
        </h3>
        <span class="task-board-count">{total ?? '—'}</span>
      </header>
      <p class={over ? 'planning-overdue' : 'planning-muted'}>
        {count ?? '—'} active
        {column.wip_limit !== null ? ` / ${column.wip_limit} WIP limit${over ? ' · Over limit' : ''}` : ''}
      </p>
    </>
  )
}
function filterLabel(key: string, value: string | boolean) {
  if (key === 'priority') return `${['No', 'Low', 'Medium', 'High'][Number(value)]} priority`
  if (key === 'blocked') return 'Blocked only'
  if (key === 'archived') return value === 'only' ? 'Archived tasks' : 'Including archived'
  if (key === 'due_after') return `Due from ${value}`
  if (key === 'due_before') return `Due through ${value}`
  return `Label: ${value}`
}
function columnClass(column: TaskBoardColumn, items: TaskItem[], actions: Actions) {
  return `task-board-column${actions.dragOver === column.id || items.some((item) => item.id === actions.dragOver) ? ' is-drop-target' : ''}`
}
function UpdatingTasks({ fetching, loading }: { fetching: boolean; loading: boolean }) {
  return fetching && !loading ? (
    <span class="task-board-updating" aria-hidden="true">
      Updating…
    </span>
  ) : null
}
function UpdatingFilters({
  search,
  label,
  debounced,
}: {
  search: string
  label: string
  debounced: { search: string; label: string }
}) {
  return search !== debounced.search || label !== debounced.label ? (
    <p role="status">Updating filters…</p>
  ) : null
}
function BoardColumn({
  column,
  project,
  search,
  projects,
  actions,
  canEdit,
  filters,
}: {
  column: TaskBoardColumn
  project: string
  search: string
  projects: TaskProject[]
  actions: Actions
  canEdit: boolean
  filters: BoardFilters
}) {
  const [page, setPage] = useState(1),
    [collapsed, setCollapsed] = useState(false),
    [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const queryContext = JSON.stringify([project, search, filters])
  useEffect(() => setPage(1), [queryContext])
  const result = useQuery({
    queryKey: ['task-items', auth.value.user, 'board', project, search, column.id, filters, page],
    placeholderData: (previous) => previous,
    queryFn: () =>
      api.listTasks({
        project_id: project || undefined,
        search,
        status: 'all',
        column_id: column.id,
        ...filters,
        priority: filters.priority ? Number(filters.priority) : undefined,
        label: filters.label || undefined,
        blocked: filters.blocked || undefined,
        due_before: filters.due_before || undefined,
        due_after: filters.due_after || undefined,
        page,
        per_page: 20,
      }),
  })
  const totals = useQuery({
    queryKey: ['task-items', auth.value.user, 'board-count', column.id],
    queryFn: () =>
      api.listTasks({ column_id: column.id, status: 'all', archived: 'exclude', page: 1, per_page: 1 }),
  })
  useEffect(() => {
    if (result.data && !result.isPlaceholderData && !result.isFetching) {
      setPage((previous) => Math.min(previous, Math.max(1, Math.ceil(result.data.total / 20))))
    }
  }, [result.data, result.isPlaceholderData, result.isFetching])
  const items = result.data?.data ?? []
  const cardActions = result.isPlaceholderData ? { ...actions, busy: true } : actions
  return (
    <section
      class={columnClass(column, items, actions)}
      style={{ '--task-column-color': column.color }}
      aria-label={`${column.title} column`}
      onDragOver={(e) => {
        if (actions.dragging && !actions.busy) {
          e.preventDefault()
          actions.setDragOver(column.id)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) actions.setDragOver('')
      }}
      onDrop={(e) => {
        e.preventDefault()
        actions.drop(column.id, items)
      }}
    >
      <ColumnHeader
        column={column}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        count={totals.data?.total}
        total={result.data?.total}
      />
      {!collapsed && (
        <>
          <form
            class="task-board-quick-add"
            onSubmit={async (e) => {
              e.preventDefault()
              const submitted = title
              if (submitted.trim() && (await actions.create(submitted.trim(), column.id))) {
                setTitle((current) => (current === submitted ? '' : current))
                inputRef.current?.focus()
              }
            }}
          >
            <input
              ref={inputRef}
              aria-label={`New task in ${column.title}`}
              placeholder="Add a task…"
              value={title}
              maxLength={255}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
            <button disabled={actions.busy || !title.trim()}>Add</button>
          </form>
          <PlanningError error={result.error} retry={() => void result.refetch()} />
          <PlanningError error={totals.error} retry={() => void totals.refetch()} />
          <UpdatingTasks fetching={result.isFetching} loading={result.isLoading} />
          {result.isLoading ? (
            <p>Loading tasks…</p>
          ) : (
            <ul class="task-board-cards">
              {items.map((item, index) => (
                <BoardCard
                  key={item.id}
                  item={item}
                  index={index}
                  items={items}
                  column={column}
                  actions={cardActions}
                  projects={projects}
                  canEdit={canEdit}
                  filters={filters}
                />
              ))}
            </ul>
          )}
          {!result.isLoading && !items.length && !result.error && (
            <div class="task-board-empty">No {column.title.toLowerCase()} tasks</div>
          )}
          <Pagination page={page} total={result.data?.total ?? 0} change={setPage} />
        </>
      )}
    </section>
  )
}
export function TaskBoard({
  project,
  search,
  projects,
  edit,
  remove,
  canEdit,
}: {
  project: string
  search: string
  projects: TaskProject[]
  edit: (item: TaskItem) => void
  remove: (item: TaskItem) => void
  canEdit: boolean
}) {
  const client = useQueryClient()
  const [filters, setFilters] = useState<BoardFilters>({ ...defaultFilters })
  const [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(''),
    [error, setError] = useState<unknown>(null),
    [announcement, setAnnouncement] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false),
    [fullscreen, setFullscreen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [dragOver, setDragOver] = useState('')
  const [debounced, setDebounced] = useState({ search, label: filters.label })
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ search, label: filters.label }), 200)
    return () => clearTimeout(timer)
  }, [search, filters.label])
  const [selected, setSelected] = useState(new Map<string, TaskItem>())
  const [activeView, setActiveView] = useState('')
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!fullscreen || !boardRef.current) return
    const previousFocus = document.activeElement as HTMLElement | null
    const inertElements: { element: HTMLElement; inert: boolean }[] = []
    let branch: HTMLElement = boardRef.current
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inertElements.push({ element: sibling, inert: sibling.inert })
          sibling.inert = true
        }
      }
      branch = branch.parentElement
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setFullscreen(false)
    }
    document.addEventListener('keydown', escape)
    boardRef.current.focus()
    return () => {
      document.removeEventListener('keydown', escape)
      inertElements.forEach(({ element, inert }) => {
        element.inert = inert
      })
      previousFocus?.focus()
    }
  }, [fullscreen])
  const [viewName, setViewName] = useState(''),
    [views, setViews] = useState(() => readViews(auth.value.user ?? ''))
  const context = JSON.stringify([auth.value.user, currentSessionGeneration(), project, search, filters])
  const contextRef = useRef(context)
  contextRef.current = context
  const pending = useRef(false),
    mounted = useRef(true),
    drag = useRef<{ item: TaskItem; context: string } | null>(null)
  const settings = useQuery({ queryKey: ['task-board', auth.value.user], queryFn: api.getTaskBoard })
  const columns = settings.data?.data.columns ?? []
  useEffect(
    () => () => {
      mounted.current = false
      drag.current = null
    },
    [],
  )
  useEffect(() => {
    drag.current = null
    setDragging('')
    setDragOver('')
    setSelected(new Map())
    setError(null)
    setAnnouncement('')
  }, [context])
  const endDrag = () => {
    drag.current = null
    setDragging('')
    setDragOver('')
  }
  const run = async (work: (current: () => boolean) => Promise<string>) => {
    if (pending.current) return false
    const token = auth.value.token,
      user = auth.value.user,
      requestContext = contextRef.current
    const sameSession = () => auth.value.token === token && auth.value.user === user
    const current = () => mounted.current && sameSession() && requestContext === contextRef.current
    pending.current = true
    setBusy(true)
    setError(null)
    endDrag()
    let success = false
    try {
      const message = await work(current)
      if (current()) {
        setAnnouncement(message)
        success = true
        setSelected(new Map())
      }
    } catch (failure) {
      if (current()) {
        setError(failure)
        void client.invalidateQueries({ queryKey: ['task-board'] })
      }
    } finally {
      if (sameSession()) void client.invalidateQueries({ queryKey: ['task-items'] })
      pending.current = false
      if (mounted.current && sameSession()) setBusy(false)
    }
    return success
  }
  const cacheTask = (response: { data?: TaskItem } | undefined) => {
    const task = response?.data
    if (!task) return
    client.setQueriesData<TaskItemsResponse>({ queryKey: ['task-items', auth.value.user] }, (previous) =>
      previous
        ? {
            ...previous,
            data: previous.data.map((existing) => (existing.id === task.id ? task : existing)),
          }
        : previous,
    )
  }
  const update = (item: TaskItem, body: TaskPatch, message: string) => {
    return run(async (current) => {
      const response = await api.updateTask(item.id, { ...body, expected_updated_at: item.updated_at })
      if (current()) cacheTask(response)
      return message
    })
  }
  const reorder = (item: TaskItem, column: string, target?: TaskItem, after = false) => {
    void run(async (current) => {
      const all: TaskItem[] = []
      let page = 1
      while (current()) {
        const response = await api.listTasks({
          column_id: column,
          status: 'all',
          archived: 'include',
          sort: 'manual',
          page,
          per_page: 100,
        })
        all.push(...response.data.filter((i) => i.id !== item.id))
        if (page * 100 >= response.total) break
        page++
      }
      if (!current()) return ''
      let index = target ? all.findIndex((i) => i.id === target.id) : all.length
      if (index < 0) throw new Error('The destination task changed. Refresh and retry.')
      if (after) index++
      const before = all[index]
      let position: number | undefined
      try {
        position = positionBefore(all, before)
      } catch {
        /* Tied legacy positions need versioned normalization. */
      }
      if (position !== undefined) {
        const response = await api.updateTask(item.id, {
          column_id: column,
          position,
          expected_updated_at: item.updated_at,
        })
        if (current()) cacheTask(response)
      } else {
        all.splice(index, 0, item)
        let changed = 0
        for (let n = 0; n < all.length; n++) {
          if (!current()) return ''
          const task = all[n]
          try {
            await api.updateTask(task.id, {
              column_id: column,
              position: (n + 1) * 1024,
              expected_updated_at: task.updated_at,
            })
            changed++
          } catch {
            throw new Error(
              `Ordering stopped after ${changed} updates because a task changed or could not be saved. The board has been refreshed; retry the move.`,
            )
          }
        }
      }
      return `Moved ${item.title} to ${columns.find((c) => c.id === column)?.title}.`
    })
  }
  const move = (item: TaskItem, column: string) => {
    if (columnOf(item, columns) !== column) reorder(item, column)
  }
  const actions: Actions = {
    busy,
    dragging,
    selecting,
    dragOver,
    setDragOver,
    columns,
    selected,
    select: (item) =>
      setSelected((previous) => {
        const next = new Map(previous)
        if (next.has(item.id)) next.delete(item.id)
        else next.set(item.id, item)
        return next
      }),
    startDrag: (item) => {
      if (pending.current) return false
      drag.current = { item: { ...item }, context: contextRef.current }
      setDragging(item.id)
      return true
    },
    endDrag,
    drop: (column, _items, target) => {
      const source = drag.current
      if (
        !source ||
        source.context !== contextRef.current ||
        pending.current ||
        target?.id === source.item.id
      ) {
        return
      }
      reorder(source.item, column, target)
      endDrag()
    },
    reorder,
    move,
    update,
    create: (title, column, source) =>
      run(async () => {
        const details = source
          ? duplicateDetails(source)
          : {
              description: '',
              due_date: null,
              priority: 0 as const,
              labels: [],
              checklist: [],
              custom_fields: [],
            }
        await api.createTask({
          ...details,
          title,
          column_id: column,
          project_id: source ? source.project_id : project && project !== 'inbox' ? project : null,
          recurrence: null,
        })
        return source ? 'Task duplicated without recurrence.' : 'Task added.'
      }),
    edit,
    remove,
  }
  const bulk = (body: TaskPatch) =>
    void run(async (current) => {
      let succeeded = 0,
        failed = 0
      for (const item of selected.values()) {
        if (!current()) break
        try {
          await api.updateTask(item.id, { ...body, expected_updated_at: item.updated_at })
          succeeded++
        } catch {
          failed++
        }
      }
      return `${succeeded} updated; ${failed} failed.${failed ? ' Refresh and reselect failed tasks to retry.' : ''}`
    })
  const filter = (patch: Partial<BoardFilters>) => {
    setActiveView('')
    setFilters({ ...filters, ...patch })
  }
  return (
    <div ref={boardRef} tabIndex={-1} class={fullscreen ? 'task-board-fullscreen' : ''}>
      <BoardAppearance key={auth.value.user} user={auth.value.user} busy={busy}>
        <div class="task-board-toolbar">
          <button disabled={busy || !settings.data} onClick={() => setSettingsOpen(!settingsOpen)}>
            Board settings
          </button>
          <button
            aria-pressed={selecting}
            onClick={() => {
              setSelecting(!selecting)
              setSelected(new Map())
            }}
          >
            {selecting ? 'Done selecting' : 'Select tasks'}
          </button>
          <button onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
          <label>
            Sort
            <select
              value={filters.sort}
              onChange={(e) => filter({ sort: e.currentTarget.value as BoardFilters['sort'] })}
            >
              {[
                ['manual', 'Manual order'],
                ['due', 'Due date'],
                ['priority', 'Priority'],
                ['newest', 'Newest first'],
                ['oldest', 'Oldest first'],
                ['title', 'Title'],
              ].map(([value, label]) => (
                <option value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <div class="task-board-filter-chips">
          {Object.entries(filters)
            .filter(([key, value]) => key !== 'sort' && value !== defaultFilters[key as keyof BoardFilters])
            .map(([key, value]) => (
              <button
                aria-label={`Remove ${key} filter`}
                onClick={() => filter({ [key]: defaultFilters[key as keyof BoardFilters] })}
              >
                {filterLabel(key, value)} ×
              </button>
            ))}
          {Object.keys(filters).some(
            (key) =>
              key !== 'sort' &&
              filters[key as keyof BoardFilters] !== defaultFilters[key as keyof BoardFilters],
          ) && (
            <button
              onClick={() => {
                setActiveView('')
                setFilters({ ...defaultFilters })
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <details class="task-board-filter-panel">
          <summary>
            Filters &amp; saved views
            {Object.keys(defaultFilters).filter(
              (k) =>
                k !== 'sort' && filters[k as keyof BoardFilters] !== defaultFilters[k as keyof BoardFilters],
            ).length > 0
              ? ' · Active filters'
              : ''}
          </summary>
          <div class="task-board-toolbar">
            <label>
              Priority
              <select
                aria-label="Filter priority"
                value={filters.priority}
                onChange={(e) => filter({ priority: e.currentTarget.value })}
              >
                <option value="">All priorities</option>
                {['None', 'Low', 'Medium', 'High'].map((p, i) => (
                  <option value={i}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Label
              <input
                maxLength={40}
                value={filters.label}
                onInput={(e) => filter({ label: e.currentTarget.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.blocked}
                onChange={(e) => filter({ blocked: e.currentTarget.checked })}
              />
              Blocked only
            </label>
            <label>
              Due from
              <input
                type="date"
                value={filters.due_after}
                onChange={(e) => filter({ due_after: e.currentTarget.value })}
              />
            </label>
            <label>
              Due through
              <input
                type="date"
                value={filters.due_before}
                onChange={(e) => filter({ due_before: e.currentTarget.value })}
              />
            </label>
            <label>
              Archive
              <select
                value={filters.archived}
                onChange={(e) => filter({ archived: e.currentTarget.value as BoardFilters['archived'] })}
              >
                <option value="exclude">Active</option>
                <option value="include">All tasks</option>
                <option value="only">Archived</option>
              </select>
            </label>
            <button
              onClick={() => {
                setActiveView('')
                setFilters({ ...defaultFilters })
              }}
            >
              Reset filters
            </button>
          </div>
          <div class="task-board-views">
            <label>
              Saved view
              <select
                value={activeView}
                onChange={(e) => {
                  if (!e.currentTarget.value) {
                    setActiveView('')
                    return
                  }
                  const view = views.find((saved) => saved.name === e.currentTarget.value)
                  if (view) {
                    setFilters(view.filters)
                    setActiveView(view.name)
                  }
                }}
              >
                <option value="">Choose view…</option>
                {views.map((v) => (
                  <option value={v.name}>{v.name}</option>
                ))}
              </select>
            </label>
            <input
              aria-label="View name"
              placeholder="View name"
              maxLength={80}
              value={viewName}
              onInput={(e) => setViewName(e.currentTarget.value)}
            />
            <button
              disabled={!viewName.trim()}
              onClick={() => {
                try {
                  const next = [
                    ...views.filter((v) => v.name !== viewName.trim()),
                    { name: viewName.trim(), filters },
                  ].slice(-20)
                  localStorage.setItem(
                    `aurboda:task-views:${encodeURIComponent(auth.value.user ?? '')}`,
                    JSON.stringify(next),
                  )
                  setViews(next)
                  setActiveView(viewName.trim())
                  setViewName('')
                } catch {
                  setError(new Error('Browser storage is unavailable. Your view was not saved.'))
                }
              }}
            >
              Save view
            </button>
            <button
              disabled={!activeView}
              onClick={() => {
                try {
                  const next = views.filter((view) => view.name !== activeView)
                  localStorage.setItem(
                    `aurboda:task-views:${encodeURIComponent(auth.value.user ?? '')}`,
                    JSON.stringify(next),
                  )
                  setViews(next)
                  setActiveView('')
                } catch {
                  setError(new Error('Unable to remove saved views.'))
                }
              }}
            >
              Delete selected view
            </button>
          </div>
        </details>
        {settingsOpen && settings.data && (
          <BoardSettings
            settings={settings.data.data}
            busy={busy}
            close={() => setSettingsOpen(false)}
            save={(draft, version) => {
              void run(async (current) => {
                await api.updateTaskBoard({
                  columns: draft,
                  expected_updated_at: version,
                })
                if (current()) {
                  await client.invalidateQueries({ queryKey: ['task-board'] })
                  setSettingsOpen(false)
                }
                return 'Board settings saved.'
              })
            }}
          />
        )}
        {!!selected.size && (
          <div class="task-board-bulk">
            <strong>{selected.size} selected</strong>
            <select
              aria-label="Move selected tasks"
              disabled={busy}
              value=""
              onChange={(e) => {
                if (e.currentTarget.value) bulk({ column_id: e.currentTarget.value, position: 0 })
              }}
            >
              <option value="">Move selected to…</option>
              {columns.map((c) => (
                <option value={c.id}>{c.title}</option>
              ))}
            </select>
            <button disabled={busy} onClick={() => bulk({ archived: true })}>
              Archive selected
            </button>
            <button disabled={busy} onClick={() => bulk({ archived: false })}>
              Restore selected
            </button>
            <button disabled={busy} onClick={() => setSelected(new Map())}>
              Clear selection
            </button>
          </div>
        )}
        <p class="planning-muted task-board-help">
          Click a title to edit. Drag a handle to move a task, or open ••• for more actions.
        </p>
        <div class="task-board-announcement" role="status" aria-live="polite">
          {busy ? 'Saving changes…' : announcement}
        </div>
        <PlanningError
          error={error}
          retry={() => {
            setError(null)
            void client.invalidateQueries({ queryKey: ['task-items'] })
            void settings.refetch()
          }}
        />
        <PlanningError error={settings.error} retry={() => void settings.refetch()} />
        {settings.isLoading && <p>Loading board…</p>}
        <UpdatingFilters search={search} label={filters.label} debounced={debounced} />
        <div class="task-board" tabIndex={0} role="region" aria-label="Task board columns">
          {columns.map((column) => (
            <BoardColumn
              key={`${auth.value.user}:${currentSessionGeneration()}:${column.id}`}
              column={column}
              project={project}
              search={debounced.search}
              projects={projects}
              actions={actions}
              canEdit={canEdit}
              filters={{ ...filters, label: debounced.label }}
            />
          ))}
        </div>
      </BoardAppearance>
    </div>
  )
}
