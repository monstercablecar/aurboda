import type { TaskBoardColumn, TaskBoardSettings, TaskWorkflowStatus } from '@aurboda/api-spec'

import { useState } from 'preact/hooks'

import './BoardSettings.css'
export function BoardSettings({
  settings,
  busy,
  save,
  close,
}: {
  settings: TaskBoardSettings
  busy: boolean
  save: (columns: TaskBoardColumn[], version: string) => void
  close: () => void
}) {
  const [version, setVersion] = useState(settings.updated_at)
  const [columns, setColumns] = useState(settings.columns.map((c) => ({ ...c })))
  const invalidLimit = columns.some(
    (column) =>
      column.wip_limit !== null &&
      (!Number.isInteger(column.wip_limit) || column.wip_limit < 1 || column.wip_limit > 10000),
  )
  const missingCategory = !['todo', 'in_progress', 'done'].every((status) =>
    columns.some((column) => column.status === status),
  )
  const changed = JSON.stringify(columns) !== JSON.stringify(settings.columns)
  const change = (index: number, patch: Partial<TaskBoardColumn>) =>
    setColumns(columns.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  return (
    <section class="task-board-settings" aria-label="Board settings">
      <h3>Set up your workflow</h3>
      <p class="planning-muted">
        Name your columns to match how you work. A column that counts as Done completes its tasks.
      </p>
      {version !== settings.updated_at && (
        <p role="alert" class="planning-error">
          These columns changed in another window. Reload below to start from the latest version.
        </p>
      )}
      {columns.map((c, i) => (
        <div class="task-board-setting-row" key={c.id}>
          <label>
            Column title
            <input
              disabled={busy}
              aria-label={`Column ${i + 1} title`}
              maxLength={80}
              value={c.title}
              onInput={(e) => change(i, { title: e.currentTarget.value })}
            />
          </label>
          <label>
            Counts as
            <select
              disabled={busy}
              value={c.status}
              onChange={(e) => change(i, { status: e.currentTarget.value as TaskWorkflowStatus })}
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label>
            Color
            <input
              disabled={busy}
              type="color"
              value={c.color}
              onInput={(e) => change(i, { color: e.currentTarget.value })}
            />
          </label>
          <label>
            Task limit (optional)
            <input
              disabled={busy}
              type="number"
              aria-invalid={
                c.wip_limit !== null &&
                (!Number.isInteger(c.wip_limit) || c.wip_limit < 1 || c.wip_limit > 10000)
              }
              placeholder="No limit"
              min="1"
              max="10000"
              value={c.wip_limit ?? ''}
              onInput={(e) =>
                change(i, { wip_limit: e.currentTarget.value ? Number(e.currentTarget.value) : null })
              }
            />
          </label>
          <button
            disabled={busy || i === 0}
            aria-label={`Move ${c.title} column left`}
            onClick={() => {
              const next = [...columns]
              ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
              setColumns(next)
            }}
          >
            ←
          </button>
          <button
            disabled={busy || i === columns.length - 1}
            aria-label={`Move ${c.title} column right`}
            onClick={() => {
              const next = [...columns]
              ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
              setColumns(next)
            }}
          >
            →
          </button>
          <button
            disabled={busy || columns.length <= 3}
            onClick={() => setColumns(columns.filter((_, n) => n !== i))}
          >
            Remove column
          </button>
        </div>
      ))}
      <p class="planning-muted">
        Task limits show a warning when a column is getting full; they never block a move. Move all tasks out
        of a column before removing it or changing what it counts as.
      </p>
      {invalidLimit && (
        <p role="alert" class="planning-error">
          Use a whole-number task limit from 1 to 10,000, or leave it blank.
        </p>
      )}
      {missingCategory && (
        <p role="alert" class="planning-error">
          Keep at least one To do, In progress, and Done column.
        </p>
      )}
      <div class="task-board-settings-footer">
        <button
          disabled={busy || columns.length >= 21}
          onClick={() =>
            setColumns([
              ...columns,
              {
                id: crypto.randomUUID(),
                title: 'New column',
                status: 'todo',
                color: '#64748b',
                wip_limit: null,
              },
            ])
          }
        >
          Add column
        </button>
        <button
          disabled={
            busy ||
            invalidLimit ||
            !changed ||
            columns.some((c) => !c.title.trim()) ||
            !['todo', 'in_progress', 'done'].every((s) => columns.some((c) => c.status === s))
          }
          onClick={() => save(columns, version)}
        >
          {busy ? 'Saving…' : 'Save columns'}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setColumns(settings.columns.map((c) => ({ ...c })))
            setVersion(settings.updated_at)
          }}
        >
          Reload columns (discard draft)
        </button>
        <button disabled={busy} onClick={close}>
          Cancel
        </button>
      </div>
    </section>
  )
}
