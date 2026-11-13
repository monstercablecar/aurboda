import { useState } from 'preact/hooks'

import { renderMarkdown } from '../../utils/markdown'
import './TaskDescription.css'

export function TaskDescription({ value, className = '' }: { value: string; className?: string }) {
  return (
    <div
      class={`task-description ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
    />
  )
}

export function TaskDescriptionEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [editing, setEditing] = useState(!value)
  return (
    <div class="task-description-editor">
      {editing ? (
        <label>
          Details
          <textarea
            rows={4}
            maxLength={10000}
            value={value}
            onInput={(event) => onChange(event.currentTarget.value)}
          />
        </label>
      ) : (
        <section aria-label="Details">
          <strong>Details</strong>
          <TaskDescription value={value} />
        </section>
      )}
      <button type="button" onClick={() => setEditing(!editing)}>
        {editing ? 'Read details' : 'Edit details'}
      </button>
    </div>
  )
}
