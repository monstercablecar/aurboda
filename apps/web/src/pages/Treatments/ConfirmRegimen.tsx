import type { AdministrationEvent, TodayResponse } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'preact/hooks'

import { confirmRegimen, pharmacologyErrorMessage } from '../../state/api'
import { newId } from '../../utils/uuid'
import {
  buildConfirmRegimenBody,
  nowLocalDateTime,
  regimenItemDrafts,
  regimenScheduledAt,
  stableActionKey,
  type ConfirmItemDraft,
} from './model'

type DueRegimen = TodayResponse['data']['due_regimens'][number]

export function ConfirmRegimen({
  date,
  due,
  onCancel,
  onSaved,
  timezone,
}: {
  date: string
  due: DueRegimen
  onCancel: () => void
  onSaved: (events: AdministrationEvent[]) => void
  timezone: string
}) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const needsActualTime = date < today || due.incomplete_item_ids.length > 0
  const [items, setItems] = useState<ConfirmItemDraft[]>(() =>
    regimenItemDrafts(due.regimen).filter(
      (item) =>
        !due.confirmed_item_ids.includes(item.item_id) &&
        !due.regimen.items.find((source) => source.id === item.item_id)?.paused,
    ),
  )
  const [actualLocal, setActualLocal] = useState(() => (needsActualTime ? '' : nowLocalDateTime()))
  const [error, setError] = useState('')
  const [result, setResult] = useState<AdministrationEvent[] | null>(null)
  const [idempotencyKey] = useState(() => stableActionKey(`regimen:${due.regimen.id}`, newId))
  const selectedCount = items.filter((item) => item.selected).length
  const isPartial = selectedCount > 0 && selectedCount < items.length
  const scheduledAt = useMemo(() => {
    const times = items
      .filter((draft) => draft.selected)
      .map((draft) => {
        const source = due.regimen.items.find((item) => item.id === draft.item_id)
        return source ? regimenScheduledAt(source, date) : undefined
      })
    return new Set(times).size === 1 ? times[0] : undefined
  }, [date, due.regimen.items, items])

  const mutation = useMutation({
    mutationFn: () => {
      const body = buildConfirmRegimenBody({
        actualLocal,
        idempotencyKey,
        items,
        scheduledAt,
        timezone,
      })
      if (body.items.length === 0) throw new Error('Select at least one item to record.')
      return confirmRegimen(due.regimen.id, body)
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: (events) => {
      setError('')
      setResult(events)
      onSaved(events)
    },
  })

  const updateItem = (index: number, updates: Partial<ConfirmItemDraft>) =>
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item)),
    )

  if (result) {
    return (
      <section class="treatments-form" aria-live="polite">
        <h2>Recorded</h2>
        <p>
          {result.length} administration{result.length === 1 ? '' : 's'} saved for {due.regimen.name}.
        </p>
        <ul class="item-list">
          {result.map((event) => (
            <li key={event.id}>
              <span>{new Date(event.administered_at).toLocaleTimeString([], { timeStyle: 'short' })}</span>
              <strong>
                {event.dose} {event.dose_unit}
              </strong>
            </li>
          ))}
        </ul>
        <button class="btn-primary" type="button" onClick={onCancel}>
          Done
        </button>
      </section>
    )
  }

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
          <p class="treatments-kicker">Confirm stack</p>
          <h2>{due.regimen.name}</h2>
        </div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close confirmation">
          ×
        </button>
      </div>
      <label class="field full-field">
        <span>Actually administered at</span>
        <input
          required
          type="datetime-local"
          value={actualLocal}
          onInput={(event) => setActualLocal((event.target as HTMLInputElement).value)}
        />
      </label>
      <p class="form-hint">
        {needsActualTime
          ? 'Enter the actual date and time for this historical entry. No time has been filled in for you.'
          : 'Check the actual date and time before saving. For an earlier dose, enter when it happened.'}
      </p>
      {due.regimen.items.some((item) => Number(item.scheduled_local_time?.slice(0, 2) ?? -1) >= 18) && (
        <p class="form-hint">
          Evening doses scheduled for 6 p.m. or later count toward the previous night when taken before
          6 a.m. Keep the actual date and time taken; tonight’s stack stays unfinished.
        </p>
      )}
      <fieldset class="confirm-items">
        <legend>Items to record</legend>
        {items.map((item, index) => {
          const configured = due.regimen.items.find((candidate) => candidate.id === item.item_id)!
          return (
            <div class={`confirm-item${item.selected ? '' : ' unselected'}`} key={item.item_id}>
              <label class="check-label">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(event) =>
                    updateItem(index, { selected: (event.target as HTMLInputElement).checked })
                  }
                />
                <strong>{configured.substance.display_name}</strong>
              </label>
              <div class="form-grid compact-grid">
                <label class="field">
                  <span>Dose</span>
                  <input
                    disabled={!item.selected}
                    min="0"
                    required={item.selected}
                    step="any"
                    type="number"
                    value={item.dose}
                    onInput={(event) => updateItem(index, { dose: (event.target as HTMLInputElement).value })}
                  />
                </label>
                <label class="field">
                  <span>Unit</span>
                  <input
                    disabled={!item.selected}
                    required={item.selected}
                    value={item.dose_unit}
                    onInput={(event) =>
                      updateItem(index, { dose_unit: (event.target as HTMLInputElement).value })
                    }
                  />
                </label>
                <label class="field">
                  <span>Route</span>
                  <input
                    disabled={!item.selected}
                    value={item.route}
                    onInput={(event) =>
                      updateItem(index, { route: (event.target as HTMLInputElement).value })
                    }
                  />
                </label>
                <label class="field">
                  <span>Outcome</span>
                  <select
                    disabled={!item.selected}
                    value={item.status}
                    onChange={(event) =>
                      updateItem(index, {
                        status: (event.target as HTMLSelectElement).value as ConfirmItemDraft['status'],
                      })
                    }
                  >
                    <option value="taken">Taken</option>
                    <option value="delayed">Delayed</option>
                    <option value="partially_taken">Partially taken</option>
                    <option value="skipped">Skipped</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>
            </div>
          )
        })}
      </fieldset>
      {isPartial && (
        <p class="partial-callout">
          Partial confirmation: only {selectedCount} selected item(s) will be saved.
        </p>
      )}
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending || selectedCount === 0}>
          {mutation.isPending ? 'Saving…' : isPartial ? 'Confirm selected' : 'Confirm all'}
        </button>
      </div>
    </form>
  )
}
