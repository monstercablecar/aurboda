import type {
  TaskItem,
  TaskBoardColumn,
  TaskProject,
  CreateTaskItemBody,
  TaskWorkflowStatus,
  TaskRecurrence,
} from '@aurboda/api-spec'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'preact-iso'
import { useEffect, useRef, useState } from 'preact/hooks'

import {
  DeletePlanningItem,
  localDate,
  Pagination,
  PlanningDialog,
  PlanningError,
  prettyDate,
} from '../../components/PlanningUI'
import * as api from '../../state/api/tasks'
import { auth } from '../../state/auth'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { workflowColumns, workflowLabel, workflowOf } from './task-workflow'
import { TaskBoard } from './TaskBoard'
import { TaskDetailsFields, TaskDetailsSummary, taskDetailsDraft, taskDetailsBody } from './TaskDetailsFields'
import { TaskRecurrenceBadge, recurrenceLabels } from './TaskRecurrenceBadge'
const priorities = ['No priority', 'Low', 'Medium', 'High']
// eslint-disable-next-line complexity -- Optional task fields initialize the same create/edit form.
export function TaskEditor({
  item,
  projects,
  projectId,
  columns,
  close,
  saved,
}: {
  item?: TaskItem
  projects: TaskProject[]
  projectId?: string
  columns?: TaskBoardColumn[]
  close: () => void
  saved: () => void
}) {
  const titleInput = useRef<HTMLInputElement>(null)
  useEffect(() => titleInput.current?.focus(), [])
  const [repeatOpen, setRepeatOpen] = useState(!!item?.recurrence || !!item?.next_occurrence_id)
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [project, setProject] = useState(
    item ? (item.project_id ?? '') : projectId === 'inbox' ? '' : (projectId ?? ''),
  )
  const [due, setDue] = useState(item?.due_date ?? '')
  const [recurrence, setRecurrence] = useState<TaskRecurrence | null>(item?.recurrence ?? null)
  const [priority, setPriority] = useState<CreateTaskItemBody['priority']>(item?.priority ?? 0)
  const [workflow, setWorkflow] = useState<TaskWorkflowStatus>(item ? workflowOf(item) : 'todo')
  const [details, setDetails] = useState(() => taskDetailsDraft(item))
  const [columnId, setColumnId] = useState(item?.column_id ?? '')
  const selectedColumn =
    columns?.find((column) => column.id === columnId) ?? columns?.find((column) => column.status === workflow)
  const effectiveWorkflow = selectedColumn?.status ?? workflow
  // Omit unchanged workflow when configuration is unavailable so custom placement is preserved.
  const columnChange = selectedColumn
    ? { column_id: selectedColumn.id, workflow_status: effectiveWorkflow }
    : item && workflow === workflowOf(item)
      ? {}
      : { workflow_status: workflow }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <PlanningDialog title={item ? 'Edit task' : 'New task'} close={close} busy={busy}>
      <form
        class="planning-form task-editor-form"
        onInvalidCapture={(event) => {
          let parent = (event.target as HTMLElement).parentElement
          while (parent && parent !== event.currentTarget) {
            if (parent instanceof HTMLDetailsElement) parent.open = true
            parent = parent.parentElement
          }
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!busy) event.currentTarget.requestSubmit()
          }
        }}
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          const session = currentSessionGeneration()
          setBusy(true)
          setError(null)
          try {
            if (recurrence && !due) throw new Error('Choose a due date for this repeating task.')
            if (!item && recurrence && effectiveWorkflow === 'done') {
              throw new Error(
                'Start a repeating task in To do or In progress, then complete it when it is finished.',
              )
            }
            const body = {
              title: title.trim(),
              description,
              project_id: project || null,
              due_date: due || null,
              priority,
              ...columnChange,
              ...taskDetailsBody(details),
              recurrence,
            }
            if (item) await api.updateTask(item.id, { ...body, expected_updated_at: item.updated_at })
            else await api.createTask(body)
            if (session !== currentSessionGeneration()) return
            saved()
            close()
          } catch (failure) {
            if (session === currentSessionGeneration()) setError(failure)
          } finally {
            if (session === currentSessionGeneration()) setBusy(false)
          }
        }}
      >
        <fieldset class="task-editor-controls" disabled={busy}>
          <label>
            Task title
            <input
              ref={titleInput}
              required
              maxLength={255}
              value={title}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </label>
          <label>
            Details
            <textarea
              rows={4}
              maxLength={10000}
              value={description}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </label>
          <div class="planning-form-row">
            <label>
              {columns?.length ? 'Board column' : 'Status'}
              <select
                value={selectedColumn?.id ?? workflow}
                onChange={(event) => {
                  if (columns?.length) {
                    const column = columns.find((entry) => entry.id === event.currentTarget.value)
                    if (column) {
                      setColumnId(column.id)
                      setWorkflow(column.status)
                    }
                  } else setWorkflow(event.currentTarget.value as TaskWorkflowStatus)
                }}
              >
                {columns?.length
                  ? columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.title}
                      </option>
                    ))
                  : workflowColumns.map((column) => (
                      <option key={column.value} value={column.value}>
                        {column.label}
                      </option>
                    ))}
              </select>
            </label>
            <label>
              Project
              <select value={project} onChange={(e) => setProject(e.currentTarget.value)}>
                <option value="">Inbox</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {recurrence ? 'Due date' : 'Due date (optional)'}
              <input
                type="date"
                required={!!recurrence}
                value={due}
                onInput={(e) => setDue(e.currentTarget.value)}
              />
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.currentTarget.value) as CreateTaskItemBody['priority'])}
              >
                {priorities.map((p, i) => (
                  <option key={i} value={i}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details
            class="task-editor-section"
            open={repeatOpen}
            onToggle={(event) => setRepeatOpen(event.currentTarget.open)}
          >
            <summary>
              Repeat <span>{recurrence ? recurrenceLabels[recurrence] : 'Does not repeat'}</span>
            </summary>
            <label>
              Repeat
              <select
                value={recurrence ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value as TaskRecurrence | ''
                  setRecurrence(value || null)
                  if (value && !due) setDue(localDate())
                }}
              >
                <option value="">None</option>
                {Object.entries(recurrenceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {recurrence && (
              <p class="planning-muted task-repeat-help">
                Completing this task creates the next occurrence from its due date. Late completions may
                create an overdue next task.
                {recurrence === 'monthly' &&
                  ' Monthly repeats use the same day, or the last day of a shorter month.'}{' '}
                Choose None on the upcoming task to stop repeating.
              </p>
            )}
            {item?.next_occurrence_id && (
              <p class="planning-muted task-repeat-help">
                A next occurrence has already been created. Editing or completing this task again will not
                change it or create another. Edit the upcoming task to change future repeats.
              </p>
            )}
          </details>
          <TaskDetailsFields value={details} change={setDetails} existing={!!item} />
        </fieldset>
        <PlanningError error={error} />
        <p class="planning-muted task-save-status" role="status">
          {busy ? 'Saving your task…' : 'Ctrl / ⌘ + Enter to save'}
        </p>
        <div class="planning-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button class="planning-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save task'}
          </button>
        </div>
      </form>
    </PlanningDialog>
  )
}
function ProjectEditor({
  project,
  close,
  saved,
}: {
  project?: TaskProject
  close: () => void
  saved: () => void
}) {
  const [title, setTitle] = useState(project?.title ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <PlanningDialog title={project ? 'Rename project' : 'New project'} close={close} busy={busy}>
      <form
        class="planning-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            if (project) {
              await api.updateProject(project.id, {
                title: title.trim(),
                expected_updated_at: project.updated_at,
              })
            } else await api.createProject({ title: title.trim() })
            saved()
            close()
          } catch (failure) {
            setError(failure)
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Project name
          <input required maxLength={255} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <PlanningError error={error} />
        <div class="planning-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button class="planning-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save project'}
          </button>
        </div>
      </form>
    </PlanningDialog>
  )
}
// Projects are bounded paginated reads; collecting every page avoids silently hiding older projects in selectors.
async function allProjects() {
  let page = 1
  const collected: TaskProject[] = []
  while (true) {
    const result = await api.listProjects({ page, per_page: 100 })
    collected.push(...result.data)
    if (collected.length >= result.total || !result.data.length) return collected
    page++
  }
}
// eslint-disable-next-line complexity -- Task list filters, loading states and editor dialogs share account-scoped queries.
export function Tasks() {
  const { query, route } = useLocation()
  const board = query.view === 'board'
  const changeView = (value: 'list' | 'board') => {
    const params = new URLSearchParams(query)
    params.set('view', value)
    route(`/goals?${params.toString()}`)
  }
  const client = useQueryClient()
  const [project, setProject] = useState('')
  const [status, setStatus] = useState('open')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ item?: TaskItem } | null>(null)
  const [projectEditor, setProjectEditor] = useState<{ project?: TaskProject } | null>(null)
  const [deleting, setDeleting] = useState<{ title: string; remove: () => Promise<unknown> } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)
  const projects = useQuery({
    queryKey: ['task-projects', auth.value.user],
    queryFn: allProjects,
    enabled: !!auth.value.token,
  })
  const boardSettings = useQuery({
    queryKey: ['task-board', auth.value.user],
    queryFn: api.getTaskBoard,
    enabled: !!auth.value.token,
  })
  const tasks = useQuery({
    queryKey: ['task-items', auth.value.user, project, status, search, page],
    queryFn: () =>
      api.listTasks({
        project_id: project || undefined,
        status: status === 'archived' ? 'all' : status,
        archived: status === 'archived' ? 'only' : 'exclude',
        search,
        page,
        per_page: 20,
      }),
    enabled: !!auth.value.token && !board,
  })
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['task-items'] })
    void client.invalidateQueries({ queryKey: ['task-projects'] })
    void client.invalidateQueries({ queryKey: ['task-board'] })
  }
  const currentProject = projects.data?.find((p) => p.id === project)
  const columnLabel = (item: TaskItem) =>
    boardSettings.data?.data.columns.find((column) => column.id === item.column_id)?.title ??
    workflowLabel(item)
  if (!auth.value.token) return <p>Please log in to view your tasks.</p>
  return (
    <section aria-label="Tasks" class={board ? 'tasks-shell tasks-board-mode' : 'tasks-shell'}>
      <header class="planning-header">
        <div>
          <h2>{board ? 'Task board' : 'Make space for what matters'}</h2>
          {!board && <p class="planning-muted">A private inbox for the things you want to do.</p>}
        </div>
        <div class="planning-actions">
          <button onClick={() => setProjectEditor({})}>New project</button>
          <button
            class="planning-primary"
            disabled={projects.isLoading || !!projects.error}
            onClick={() => setEditor({})}
          >
            New task
          </button>
        </div>
      </header>
      <div class="task-view-switch" role="group" aria-label="Task view">
        <button type="button" aria-pressed={!board} onClick={() => changeView('list')}>
          List
        </button>
        <button type="button" aria-pressed={board} onClick={() => changeView('board')}>
          Board
        </button>
      </div>
      <div class="planning-toolbar">
        <label>
          Search tasks
          <input
            type="search"
            placeholder="Find a task…"
            maxLength={255}
            value={search}
            onInput={(e) => {
              setSearch(e.currentTarget.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Filter by project
          <select
            value={project}
            onChange={(e) => {
              setProject(e.currentTarget.value)
              setPage(1)
            }}
          >
            <option value="">All projects and Inbox</option>
            <option value="inbox">Inbox</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        {!board && (
          <label>
            Show
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="open">Open tasks</option>
              <option value="done">Completed tasks</option>
              <option value="all">All tasks</option>
              <option value="archived">Archived tasks</option>
            </select>
          </label>
        )}
        <button onClick={refresh}>Refresh</button>
      </div>
      {currentProject && (
        <div class="planning-actions">
          <button onClick={() => setProjectEditor({ project: currentProject })}>Rename project</button>
          <button
            onClick={() =>
              setDeleting({
                title: currentProject.title,
                remove: () => api.deleteProject(currentProject.id, currentProject.updated_at),
              })
            }
          >
            Delete empty project
          </button>
        </div>
      )}
      <PlanningError
        error={error || (!board && tasks.error) || projects.error}
        retry={() => {
          setError(null)
          void tasks.refetch()
          void projects.refetch()
        }}
      />
      {board ? (
        <TaskBoard
          key={`${auth.value.user}:${currentSessionGeneration()}`}
          project={project}
          search={search}
          projects={projects.data ?? []}
          canEdit={!projects.isLoading && !projects.error}
          edit={(item) => setEditor({ item })}
          remove={(item) =>
            setDeleting({ title: item.title, remove: () => api.deleteTask(item.id, item.updated_at) })
          }
        />
      ) : (
        <>
          {tasks.isLoading ? (
            <p>Loading tasks…</p>
          ) : tasks.data?.data.length ? (
            <ul class="planning-list">
              {tasks.data.data.map((item) => (
                <li class={`planning-list-row${item.done ? ' is-done' : ''}`} key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!!busy}
                    aria-label={`${item.done ? 'Reopen' : 'Complete'} ${item.title}`}
                    onChange={async () => {
                      setBusy(item.id)
                      setError(null)
                      try {
                        await api.updateTask(item.id, {
                          done: !item.done,
                          expected_updated_at: item.updated_at,
                        })
                        refresh()
                      } catch (failure) {
                        setError(failure)
                      } finally {
                        setBusy('')
                      }
                    }}
                  />
                  <div class="planning-list-content">
                    <strong class="planning-item-title">{item.title}</strong>
                    <span class="task-status-badge">
                      <span class={`task-status-dot task-status-${workflowOf(item)}`} aria-hidden="true" />
                      {columnLabel(item)}
                    </span>
                    <TaskRecurrenceBadge item={item} />
                    <TaskDetailsSummary item={item} />
                    {item.description && <p>{item.description}</p>}
                    <p class="planning-muted">
                      {projects.data?.find((p) => p.id === item.project_id)?.title ?? 'Inbox'}
                      {item.priority > 0 && ` · ${priorities[item.priority]} priority`}
                      {item.due_date && (
                        <>
                          {' '}
                          ·{' '}
                          <span class={!item.done && item.due_date < localDate() ? 'planning-overdue' : ''}>
                            {!item.done && item.due_date < localDate() ? 'Overdue · ' : ''}
                            {prettyDate(item.due_date)}
                          </span>
                        </>
                      )}
                      {item.done && ' · Completed'}
                    </p>
                  </div>
                  <div class="planning-actions">
                    <button
                      disabled={projects.isLoading || !!projects.error}
                      onClick={() => setEditor({ item })}
                    >
                      Edit
                    </button>
                    <button
                      aria-label={`Delete ${item.title}`}
                      onClick={() =>
                        setDeleting({
                          title: item.title,
                          remove: () => api.deleteTask(item.id, item.updated_at),
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div class="planning-empty">
              <h3>{status === 'done' ? 'No completed tasks yet' : 'Nothing waiting here'}</h3>
              <p>{search ? 'Try another search.' : 'Add a task whenever something comes to mind.'}</p>
            </div>
          )}
          <Pagination page={page} total={tasks.data?.total ?? 0} change={setPage} />
        </>
      )}
      {editor && (
        <TaskEditor
          item={editor.item}
          projects={projects.data ?? []}
          projectId={project}
          columns={boardSettings.data?.data.columns}
          close={() => setEditor(null)}
          saved={refresh}
        />
      )}{' '}
      {projectEditor && (
        <ProjectEditor project={projectEditor.project} close={() => setProjectEditor(null)} saved={refresh} />
      )}{' '}
      {deleting && (
        <DeletePlanningItem
          title={deleting.title}
          remove={deleting.remove}
          close={() => setDeleting(null)}
          saved={() => {
            refresh()
            setProject('')
            setPage(1)
          }}
        />
      )}
    </section>
  )
}
