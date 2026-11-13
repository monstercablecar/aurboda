import type { AdministrationEvent, Substance } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'preact/hooks'

import { createAdministration, pharmacologyErrorMessage } from '../../state/api'
import { newId } from '../../utils/uuid'
import { localDateTimeToIso, nowLocalDateTime, stableActionKey } from './model'

export function PrnForm({
  date,
  initialSubstanceId,
  onCancel,
  onSaved,
  substances,
  timezone,
  treatmentSessionId,
}: {
  date?: string
  initialSubstanceId?: string
  onCancel: () => void
  onSaved: (event: AdministrationEvent) => void
  substances: Substance[]
  timezone: string
  treatmentSessionId?: string
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
  const ordered = useMemo(
    () =>
      [...substances]
        .filter((substance) => substance.status === 'active')
        .sort(
          (left, right) =>
            Number(right.favorite) - Number(left.favorite) ||
            left.display_name.localeCompare(right.display_name),
        ),
    [substances],
  )
  const [selectedId, setSelectedId] = useState(initialSubstanceId ?? ordered[0]?.id ?? '')
  const selected = ordered.find((substance) => substance.id === selectedId)
  const [dose, setDose] = useState(() => String(selected?.default_dose ?? ''))
  const [doseUnit, setDoseUnit] = useState(selected?.dose_unit ?? '')
  const [route, setRoute] = useState(selected?.route ?? '')
  const [actualLocal, setActualLocal] = useState(() => (needsActualTime ? '' : nowLocalDateTime()))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [idempotencyKey] = useState(() => stableActionKey('prn', newId))

  const chooseSubstance = (id: string) => {
    const substance = ordered.find((candidate) => candidate.id === id)
    setSelectedId(id)
    setDose(String(substance?.default_dose ?? ''))
    setDoseUnit(substance?.dose_unit ?? '')
    setRoute(substance?.route ?? '')
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Choose a substance.')
      if (!dose || Number(dose) <= 0 || !doseUnit) throw new Error('Enter a positive dose and its unit.')
      return createAdministration({
        administered_at: localDateTimeToIso(actualLocal),
        dose: Number(dose),
        dose_unit: doseUnit,
        idempotency_key: idempotencyKey,
        notes: notes || null,
        reason: reason || null,
        route: route || null,
        side_effects: [],
        source: 'manual',
        status: 'taken',
        substance_id: selected.id,
        timezone,
        ...(treatmentSessionId && { treatment_session_id: treatmentSessionId }),
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
          <p class="treatments-kicker">Observed administration</p>
          <h2>{treatmentSessionId ? 'Link administration' : 'Add PRN'}</h2>
        </div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close PRN form">
          ×
        </button>
      </div>
      {ordered.some((substance) => substance.favorite) && (
        <fieldset class="chip-fieldset">
          <legend>Favorites</legend>
          <div class="choice-chips">
            {ordered
              .filter((substance) => substance.favorite)
              .map((substance) => (
                <button
                  class={selectedId === substance.id ? 'choice-chip selected' : 'choice-chip'}
                  key={substance.id}
                  type="button"
                  onClick={() => chooseSubstance(substance.id)}
                >
                  {substance.display_name}
                </button>
              ))}
          </div>
        </fieldset>
      )}
      {needsActualTime && (
        <p class="form-hint">
          Enter the actual date and time for this entry. No time has been filled in for you.
        </p>
      )}
      <div class="form-grid">
        <label class="field full-field">
          <span>Substance</span>
          <select
            required
            value={selectedId}
            onChange={(event) => chooseSubstance((event.target as HTMLSelectElement).value)}
          >
            <option value="">Choose…</option>
            {ordered.map((substance) => (
              <option key={substance.id} value={substance.id}>
                {substance.display_name}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>Dose</span>
          <input
            min="0"
            required
            step="any"
            type="number"
            value={dose}
            onInput={(event) => setDose((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Unit</span>
          <input
            required
            value={doseUnit}
            onInput={(event) => setDoseUnit((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Route</span>
          <input value={route} onInput={(event) => setRoute((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Actually administered at</span>
          <input
            required
            type="datetime-local"
            value={actualLocal}
            onInput={(event) => setActualLocal((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <details class="advanced-fields">
        <summary>Reason and notes</summary>
        <div class="form-grid">
          <label class="field full-field">
            <span>Reason</span>
            <input value={reason} onInput={(event) => setReason((event.target as HTMLInputElement).value)} />
          </label>
          <label class="field full-field">
            <span>Notes</span>
            <textarea
              value={notes}
              onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
            />
          </label>
        </div>
      </details>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending || !selectedId}>
          {mutation.isPending ? 'Saving…' : 'Record administration'}
        </button>
      </div>
    </form>
  )
}
