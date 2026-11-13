import type { WorkGoal, WorkProfile, WorkSettings } from '@aurboda/api-spec'

import { useState } from 'preact/hooks'

import {
  addWorkCategoryColumn,
  addWorkMetricRow,
  addWorkSection,
  appendWorkGoalRevision,
  archiveWorkCategoryColumn,
  archiveWorkMetricRow,
  archiveWorkSection,
  renameWorkCategoryColumn,
  renameWorkMetricRow,
  renameWorkProfile,
  renameWorkSection,
  reorderWorkCategoryColumns,
  reorderWorkSectionMetrics,
  resolveActiveWorkProfile,
  setWorkCategoryColumnHidden,
  setWorkMetricRowHidden,
} from './settings'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const move = <T,>(items: T[], index: number, offset: number): T[] => {
  const next = [...items]
  const destination = index + offset
  if (destination < 0 || destination >= items.length) return next
  ;[next[index], next[destination]] = [next[destination], next[index]]
  return next
}

function Rename({
  value,
  label,
  onRename,
}: {
  value: string
  label: string
  onRename: (value: string) => void
}) {
  return (
    <input
      key={value}
      aria-label={label}
      defaultValue={value}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim()
        if (next && next !== value) onRename(next)
        else event.currentTarget.value = value
      }}
    />
  )
}

function GoalEditor({
  goal,
  profile,
  onChange,
}: {
  goal?: WorkGoal
  profile: WorkProfile
  onChange: (profile: WorkProfile) => void
}) {
  const [label, setLabel] = useState('')
  const [metricId, setMetricId] = useState(
    profile.metric_rows.find((row) => !row.archived_at && row.kind !== 'marker')?.id ?? '',
  )
  const [target, setTarget] = useState('')
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')
  const save = () => {
    try {
      const number = Number(target)
      if (!Number.isFinite(number) || number <= 0) throw new Error('Enter a target greater than zero.')
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      ) {
        throw new Error('Choose a valid effective date.')
      }
      if (
        !goal &&
        (!label.trim() ||
          !profile.metric_rows.some(
            (row) => row.id === metricId && !row.archived_at && row.kind !== 'marker',
          ))
      ) {
        throw new Error('Enter a goal name and choose a metric.')
      }
      const revision = { effective_from: date, id: crypto.randomUUID(), target: number }
      onChange(
        goal
          ? goal.revisions.at(-1)?.effective_from === date
            ? {
                ...profile,
                goals: profile.goals.map((item) =>
                  item.id === goal.id
                    ? {
                        ...item,
                        revisions: item.revisions.map((previous, index) =>
                          index === item.revisions.length - 1 ? { ...previous, target: number } : previous,
                        ),
                      }
                    : item,
                ),
              }
            : appendWorkGoalRevision(profile, goal.id, revision)
          : {
              ...profile,
              goals: [
                ...profile.goals,
                { id: crypto.randomUUID(), label: label.trim(), metric_id: metricId, revisions: [revision] },
              ],
            },
      )
      setTarget('')
      setLabel('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update goal.')
    }
  }
  return (
    <fieldset class="work-custom-goal">
      <legend>
        {goal?.label ??
          (goal
            ? (profile.metric_rows.find((row) => row.id === goal.metric_id)?.label ?? 'Goal')
            : 'New goal')}
      </legend>
      {goal ? (
        <ul>
          {goal.revisions.map((revision) => (
            <li key={revision.id}>
              {revision.target} from {revision.effective_from}
              {revision.effective_until ? ` until ${revision.effective_until} (exclusive)` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <label>
            Goal name
            <input value={label} onInput={(event) => setLabel(event.currentTarget.value)} />
          </label>
          <label>
            Metric
            <select
              aria-label="Metric"
              value={metricId}
              onChange={(event) => setMetricId(event.currentTarget.value)}
            >
              <option value="">Choose a metric</option>
              {profile.metric_rows
                .filter((row) => !row.archived_at && row.kind !== 'marker')
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <label>
        Target
        <input
          type="number"
          min="0"
          step="any"
          value={target}
          onInput={(event) => setTarget(event.currentTarget.value)}
        />
      </label>
      <label>
        Effective date
        <input type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={save}>
        {goal ? 'Save target' : 'Add goal'}
      </button>
    </fieldset>
  )
}

export function VisualCustomize({
  work,
  onChange,
}: {
  work: WorkSettings
  onChange: (work: WorkSettings) => void
}) {
  const profile = resolveActiveWorkProfile(work)
  const update = (next: WorkProfile) =>
    onChange({
      ...work,
      version: 1,
      active_profile_id: next.id,
      profiles: work.profiles?.some((item) => item.id === next.id)
        ? work.profiles.map((item) => (item.id === next.id ? next : item))
        : [...(work.profiles ?? []), next],
    })
  const assign = (rowId: string, sectionId: string) =>
    update({
      ...profile,
      sections: profile.sections.map((section) => ({
        ...section,
        metric_ids: [
          ...section.metric_ids.filter((id) => id !== rowId),
          ...(section.id === sectionId ? [rowId] : []),
        ],
      })),
    })
  const addRow = () => {
    const id = crypto.randomUUID()
    update(
      addWorkMetricRow(profile, {
        id,
        meaning_id: id,
        storage_metric: `work_${id.replaceAll('-', '')}`,
        label: 'New metric',
        kind: 'input',
        hidden: false,
        label_history: [],
      }),
    )
  }
  const renderRow = (id: string, orderedIds: string[], index: number, sectionId?: string) => {
    const row = profile.metric_rows.find((item) => item.id === id)
    if (!row || row.kind === 'marker') return null
    const reorder = (offset: number) =>
      update(
        sectionId
          ? reorderWorkSectionMetrics(profile, sectionId, move(orderedIds, index, offset))
          : {
              ...profile,
              metric_rows: profile.metric_rows.map((item) => {
                const position = orderedIds.indexOf(item.id)
                if (position < 0) return item
                return (
                  profile.metric_rows.find(
                    (candidate) => candidate.id === move(orderedIds, index, offset)[position],
                  ) ?? item
                )
              }),
            },
      )
    return (
      <div class="work-custom-item" key={id}>
        <Rename
          value={row.label}
          label={`Rename metric ${row.label}`}
          onRename={(label) => update(renameWorkMetricRow(profile, id, label, new Date().toISOString()))}
        />
        <span>
          {row.kind === 'derived' ? 'Calculated' : 'Entry'}
          {row.archived_at ? ' · Archived' : ''}
        </span>
        <select
          aria-label={`Section for ${row.label}`}
          value={sectionId ?? ''}
          onChange={(event) => assign(id, event.currentTarget.value)}
        >
          <option value="">Unassigned</option>
          {profile.sections
            .filter((section) => !section.archived_at)
            .map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
        </select>
        <button
          type="button"
          aria-label={`Move ${row.label} up`}
          disabled={index === 0}
          onClick={() => reorder(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${row.label} down`}
          disabled={index === orderedIds.length - 1}
          onClick={() => reorder(1)}
        >
          ↓
        </button>
        <button type="button" onClick={() => update(setWorkMetricRowHidden(profile, id, !row.hidden))}>
          {row.hidden ? 'Show' : 'Hide'}
        </button>
        <button
          type="button"
          onClick={() =>
            update(
              row.archived_at
                ? {
                    ...profile,
                    metric_rows: profile.metric_rows.map((item) =>
                      item.id === id ? { ...item, archived_at: undefined } : item,
                    ),
                  }
                : archiveWorkMetricRow(profile, id, new Date().toISOString()),
            )
          }
        >
          {row.archived_at ? 'Restore' : 'Archive'}
        </button>
      </div>
    )
  }
  const unassigned = profile.metric_rows
    .filter(
      (row) =>
        row.kind !== 'marker' && !profile.sections.some((section) => section.metric_ids.includes(row.id)),
    )
    .map((row) => row.id)
  return (
    <div class="work-visual-customize">
      <label>
        Profile name
        <Rename
          value={profile.name}
          label="Profile name"
          onRename={(name) => update(renameWorkProfile(profile, name, new Date().toISOString()))}
        />
      </label>
      <h3>Columns</h3>
      {profile.category_columns.map((column, index) => (
        <div class="work-custom-item" key={column.id}>
          <Rename
            value={column.label}
            label={`Rename column ${column.label}`}
            onRename={(label) =>
              update(renameWorkCategoryColumn(profile, column.id, label, new Date().toISOString()))
            }
          />
          {column.archived_at && <span>Archived</span>}
          <button
            type="button"
            aria-label={`Move ${column.label} left`}
            disabled={index === 0}
            onClick={() =>
              update(
                reorderWorkCategoryColumns(
                  profile,
                  move(
                    profile.category_columns.map((item) => item.id),
                    index,
                    -1,
                  ),
                ),
              )
            }
          >
            ←
          </button>
          <button
            type="button"
            aria-label={`Move ${column.label} right`}
            disabled={index === profile.category_columns.length - 1}
            onClick={() =>
              update(
                reorderWorkCategoryColumns(
                  profile,
                  move(
                    profile.category_columns.map((item) => item.id),
                    index,
                    1,
                  ),
                ),
              )
            }
          >
            →
          </button>
          <button
            type="button"
            onClick={() => update(setWorkCategoryColumnHidden(profile, column.id, !column.hidden))}
          >
            {column.hidden ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            onClick={() =>
              update(
                column.archived_at
                  ? {
                      ...profile,
                      category_columns: profile.category_columns.map((item) =>
                        item.id === column.id ? { ...item, archived_at: undefined } : item,
                      ),
                    }
                  : archiveWorkCategoryColumn(profile, column.id, new Date().toISOString()),
              )
            }
          >
            {column.archived_at ? 'Restore' : 'Archive'}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update(
            addWorkCategoryColumn(profile, {
              id: crypto.randomUUID(),
              label: 'New column',
              hidden: false,
              label_history: [],
            }),
          )
        }
      >
        Add column
      </button>
      <h3>Sections and metrics</h3>
      <p>
        Renaming keeps existing history. Calculated metrics stay calculated. Archived items can be restored.
      </p>
      {profile.sections.map((section) => (
        <fieldset key={section.id}>
          <legend>
            {section.label}
            {section.archived_at ? ' · Archived' : ''}
          </legend>
          <Rename
            value={section.label}
            label={`Rename section ${section.label}`}
            onRename={(label) =>
              update(renameWorkSection(profile, section.id, label, new Date().toISOString()))
            }
          />
          <button
            type="button"
            aria-label={`${section.archived_at ? 'Restore' : 'Archive'} section ${section.label}`}
            onClick={() =>
              update(
                section.archived_at
                  ? {
                      ...profile,
                      sections: profile.sections.map((item) =>
                        item.id === section.id ? { ...item, archived_at: undefined } : item,
                      ),
                    }
                  : archiveWorkSection(profile, section.id, new Date().toISOString()),
              )
            }
          >
            {section.archived_at ? 'Restore section' : 'Archive section'}
          </button>
          {section.metric_ids.map((id, index) => renderRow(id, section.metric_ids, index, section.id))}
          {!section.metric_ids.length && <p>No metrics yet. Assign a metric using its section menu.</p>}
        </fieldset>
      ))}
      <h4>Unassigned metrics</h4>
      {unassigned.map((id, index) => renderRow(id, unassigned, index))}
      <div class="work-custom-actions">
        <button type="button" onClick={addRow}>
          Add metric
        </button>
        <button
          type="button"
          onClick={() =>
            update(
              addWorkSection(profile, {
                id: crypto.randomUUID(),
                label: 'New section',
                hidden: false,
                label_history: [],
                metric_ids: [],
              }),
            )
          }
        >
          Add section
        </button>
      </div>
      <h3>Goals</h3>
      <p>Each new target starts on its effective date. Earlier targets are kept.</p>
      {profile.goals.map((goal) => (
        <GoalEditor key={goal.id} goal={goal} profile={profile} onChange={update} />
      ))}
      <GoalEditor key={`new-${profile.id}`} profile={profile} onChange={update} />
    </div>
  )
}
