import type { ContextEvent, ContextEventType } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { createContextEvent, pharmacologyErrorMessage } from '../../state/api'
import { localDateTimeToIso, nowLocalDateTime } from './model'

export function ContextEventForm({
  date,
  contextTypes,
  onCancel,
  onSaved,
  timezone,
}: {
  date?: string
  contextTypes: ContextEventType[]
  onCancel: () => void
  onSaved: (event: ContextEvent) => void
  timezone: string
}) {
  const needsActualTime =
    date !== undefined &&
    date !==
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
  const activeTypes = contextTypes.filter((type) => type.active)
  const [eventTypeId, setEventTypeId] = useState(activeTypes[0]?.id ?? '')
  const [startedLocal, setStartedLocal] = useState(() => (needsActualTime ? '' : nowLocalDateTime()))
  const [endedLocal, setEndedLocal] = useState('')
  const [intensity, setIntensity] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      if (!eventTypeId) throw new Error('Choose a context type.')
      const startedAt = localDateTimeToIso(startedLocal)
      const endedAt = endedLocal ? localDateTimeToIso(endedLocal) : undefined
      if (endedAt && endedAt < startedAt) throw new Error('End time cannot be before start time.')
      return createContextEvent({
        event_type_id: eventTypeId,
        intensity: intensity ? Number(intensity) : undefined,
        metadata: {},
        notes: notes || undefined,
        started_at: startedAt,
        timezone,
        ...(endedAt && { ended_at: endedAt }),
      })
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: onSaved,
  })

  return (
    <form
      class="treatments-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!mutation.isPending) mutation.mutate()
      }}
    >
      <div class="form-heading">
        <div>
          <p class="treatments-kicker">Timeline context</p>
          <h2>Add context</h2>
        </div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close context form">
          ×
        </button>
      </div>
      {needsActualTime && (
        <p class="form-hint">
          Enter the actual date and time for this entry. No time has been filled in for you.
        </p>
      )}
      <div class="form-grid">
        <label class="field full-field">
          <span>Type</span>
          <select
            required
            value={eventTypeId}
            onChange={(event) => setEventTypeId((event.target as HTMLSelectElement).value)}
          >
            <option value="">Choose…</option>
            {activeTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.display_name}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>Started</span>
          <input
            required
            type="datetime-local"
            value={startedLocal}
            onInput={(event) => setStartedLocal((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Ended (optional)</span>
          <input
            type="datetime-local"
            value={endedLocal}
            onInput={(event) => setEndedLocal((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Intensity (optional)</span>
          <input
            step="any"
            type="number"
            value={intensity}
            onInput={(event) => setIntensity((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field full-field">
          <span>Notes</span>
          <textarea
            value={notes}
            onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
          />
        </label>
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Add to timeline'}
        </button>
      </div>
    </form>
  )
}
