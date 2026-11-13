import type { TaskItem } from '@aurboda/api-spec'

import { useState } from 'preact/hooks'

import './TaskDetailsFields.css'

export interface TaskDetailsDraft {
  labels: string
  checklist: NonNullable<TaskItem['checklist']>
  blocked_reason: string
  custom_fields: NonNullable<TaskItem['custom_fields']>
  archived: boolean
}

export function taskDetailsDraft(item?: TaskItem): TaskDetailsDraft {
  return {
    labels: (item?.labels ?? []).join(', '),
    checklist: (item?.checklist ?? []).map((entry) => ({ ...entry })),
    blocked_reason: item?.blocked_reason ?? '',
    custom_fields: (item?.custom_fields ?? []).map((entry) => ({ ...entry })),
    archived: item?.archived ?? false,
  }
}

export function taskDetailsBody(draft: TaskDetailsDraft) {
  const labels = [
    ...new Set(
      draft.labels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ]
  if (labels.length > 20 || labels.some((label) => label.length > 40)) {
    throw new Error('Use at most 20 labels, with at most 40 characters each.')
  }
  const checklist = draft.checklist.map((entry) => ({ ...entry, title: entry.title.trim() }))
  if (checklist.length > 100 || checklist.some((entry) => !entry.title || entry.title.length > 255)) {
    throw new Error('Give each checklist item a title of 1–255 characters (up to 100 items).')
  }
  const custom_fields = draft.custom_fields.map((entry) => ({ ...entry, name: entry.name.trim() }))
  if (
    custom_fields.length > 20 ||
    custom_fields.some((entry) => !entry.name || entry.name.length > 80 || entry.value.length > 1000)
  ) {
    throw new Error(
      'Custom fields need a name of 1–80 characters and a value of at most 1000 characters (up to 20 fields).',
    )
  }
  if (new Set(custom_fields.map((entry) => entry.name)).size !== custom_fields.length) {
    throw new Error('Custom field names must be unique.')
  }
  if (draft.blocked_reason.length > 2000) throw new Error('Keep the blocked reason within 2000 characters.')
  return { labels, checklist, custom_fields, blocked_reason: draft.blocked_reason, archived: draft.archived }
}

export function TaskDetailsFields({
  value,
  change,
  existing,
}: {
  value: TaskDetailsDraft
  change: (draft: TaskDetailsDraft) => void
  existing: boolean
}) {
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(value.labels || value.blocked_reason || value.custom_fields.length || value.archived),
  )
  const move = (index: number, offset: number) => {
    const checklist = [...value.checklist]
    const target = index + offset
    if (target < 0 || target >= checklist.length) return
    ;[checklist[index], checklist[target]] = [checklist[target], checklist[index]]
    change({ ...value, checklist })
  }
  return (
    <div class="task-details-fields">
      <fieldset>
        <legend>
          Checklist{' '}
          {value.checklist.length > 0 &&
            `· ${value.checklist.filter((entry) => entry.done).length}/${value.checklist.length} complete`}
        </legend>
        {value.checklist.map((entry, index) => (
          <div class="task-detail-row" key={entry.id}>
            <input
              type="checkbox"
              aria-label={`Complete checklist item ${index + 1}`}
              checked={entry.done}
              onChange={(event) =>
                change({
                  ...value,
                  checklist: value.checklist.map((item) =>
                    item.id === entry.id ? { ...item, done: event.currentTarget.checked } : item,
                  ),
                })
              }
            />
            <input
              aria-label={`Checklist item ${index + 1}`}
              required
              maxLength={255}
              value={entry.title}
              onInput={(event) =>
                change({
                  ...value,
                  checklist: value.checklist.map((item) =>
                    item.id === entry.id ? { ...item, title: event.currentTarget.value } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label={`Move checklist item ${index + 1} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move checklist item ${index + 1} down`}
              disabled={index === value.checklist.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove checklist item ${index + 1}`}
              onClick={() =>
                change({ ...value, checklist: value.checklist.filter((item) => item.id !== entry.id) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={value.checklist.length >= 100}
          onClick={() =>
            change({
              ...value,
              checklist: [...value.checklist, { id: crypto.randomUUID(), title: '', done: false }],
            })
          }
        >
          Add checklist item
        </button>
      </fieldset>
      <details
        class="task-editor-section"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>
          More details <span>Labels, blockers, custom fields{existing ? ', archive' : ''}</span>
        </summary>
        <label>
          Labels (comma separated)
          <input
            value={value.labels}
            onInput={(event) => change({ ...value, labels: event.currentTarget.value })}
          />
        </label>
        <label>
          Blocked reason
          <textarea
            rows={2}
            maxLength={2000}
            value={value.blocked_reason}
            onInput={(event) => change({ ...value, blocked_reason: event.currentTarget.value })}
          />
        </label>
        <fieldset>
          <legend>Custom fields {value.custom_fields.length > 0 && `· ${value.custom_fields.length}`}</legend>
          {value.custom_fields.map((entry, index) => (
            <div class="task-detail-row" key={index}>
              <input
                aria-label={`Custom field ${index + 1} name`}
                required
                maxLength={80}
                value={entry.name}
                onInput={(event) =>
                  change({
                    ...value,
                    custom_fields: value.custom_fields.map((item, i) =>
                      i === index ? { ...item, name: event.currentTarget.value } : item,
                    ),
                  })
                }
              />
              <input
                aria-label={`Custom field ${index + 1} value`}
                maxLength={1000}
                value={entry.value}
                onInput={(event) =>
                  change({
                    ...value,
                    custom_fields: value.custom_fields.map((item, i) =>
                      i === index ? { ...item, value: event.currentTarget.value } : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove custom field ${index + 1}`}
                onClick={() =>
                  change({ ...value, custom_fields: value.custom_fields.filter((_, i) => i !== index) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={value.custom_fields.length >= 20}
            onClick={() =>
              change({ ...value, custom_fields: [...value.custom_fields, { name: '', value: '' }] })
            }
          >
            Add custom field
          </button>
        </fieldset>
        {existing && (
          <label class="task-archive-label">
            <input
              type="checkbox"
              checked={value.archived}
              onChange={(event) => change({ ...value, archived: event.currentTarget.checked })}
            />{' '}
            Archived
          </label>
        )}
      </details>
    </div>
  )
}

export function TaskDetailsSummary({ item }: { item: TaskItem }) {
  return (
    <div class="task-details-summary">
      {!!item.labels?.length && <span>{item.labels.join(' · ')}</span>}
      {!!item.checklist?.length && (
        <span>
          Checklist {item.checklist.filter((entry) => entry.done).length}/{item.checklist.length}
        </span>
      )}
      {item.blocked_reason && <span>Blocked: {item.blocked_reason}</span>}
      {item.custom_fields?.map((entry, index) => (
        <span key={index}>
          {entry.name}: {entry.value}
        </span>
      ))}
      {item.archived && <span>Archived</span>}
    </div>
  )
}
