import type { AdministrationEvent } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'preact/hooks'

import {
  pharmacologyErrorMessage,
  updateAdministration,
  voidAdministration,
  voidAssessment,
  voidContextEvent,
} from '../../state/api'
import {
  actualVsScheduledLabel,
  groupTimelineByDay,
  isoToLocalDateTime,
  localDateTimeToIso,
  type PharmacologyTimelineEntry,
  treatmentStageLabel,
} from './model'

type TimelineType = PharmacologyTimelineEntry['type']

const entryTitle = (entry: PharmacologyTimelineEntry, substanceNames: Map<string, string>): string => {
  switch (entry.type) {
    case 'administration':
      return substanceNames.get(entry.data.substance_id) ?? 'Administration'
    case 'treatment':
      return entry.data.treatment_type.display_name
    case 'assessment':
      return `Assessment · ${entry.data.stage ? treatmentStageLabel(entry.data.stage) : 'check-in'}`
    case 'context':
      return entry.data.event_type.display_name
  }
}

const entryDetail = (entry: PharmacologyTimelineEntry): string => {
  switch (entry.type) {
    case 'administration':
      return `${entry.data.dose ?? '—'} ${entry.data.dose_unit ?? ''} · ${treatmentStageLabel(entry.data.status)}`
    case 'treatment':
      return treatmentStageLabel(entry.data.status)
    case 'assessment':
      return `${entry.data.responses.length} response${entry.data.responses.length === 1 ? '' : 's'}`
    case 'context':
      return entry.data.intensity == null ? 'Context event' : `Intensity ${entry.data.intensity}`
  }
}

function CorrectionForm({
  administration,
  onCancel,
  onSaved,
}: {
  administration: AdministrationEvent
  onCancel: () => void
  onSaved: () => void
}) {
  const [actualLocal, setActualLocal] = useState(() => isoToLocalDateTime(administration.administered_at))
  const [dose, setDose] = useState(String(administration.dose ?? ''))
  const [unit, setUnit] = useState(administration.dose_unit ?? '')
  const [route, setRoute] = useState(administration.route ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      if (!reason.trim()) throw new Error('Explain why this correction is needed.')
      return updateAdministration(administration.id, {
        administered_at: localDateTimeToIso(actualLocal),
        correction_reason: reason,
        dose: dose ? Number(dose) : null,
        dose_unit: unit || null,
        route: route || null,
      })
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: onSaved,
  })
  return (
    <form
      class="treatments-form correction-form"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <div class="form-heading">
        <h2>Correct administration</h2>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close correction form">
          ×
        </button>
      </div>
      <div class="form-grid compact-grid">
        <label class="field full-field">
          <span>Actually administered at</span>
          <input required type="datetime-local" value={actualLocal} onInput={(event) => setActualLocal((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Dose</span>
          <input step="any" type="number" value={dose} onInput={(event) => setDose((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Unit</span>
          <input value={unit} onInput={(event) => setUnit((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field full-field">
          <span>Route</span>
          <input value={route} onInput={(event) => setRoute((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field full-field">
          <span>Correction reason</span>
          <textarea required value={reason} onInput={(event) => setReason((event.target as HTMLTextAreaElement).value)} />
        </label>
      </div>
      {error && <p class="form-error">{error}</p>}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save correction'}
        </button>
      </div>
    </form>
  )
}

export function TimelineView({
  entries,
  notify,
  onRefresh,
  substanceNames,
}: {
  entries: PharmacologyTimelineEntry[]
  notify: (message: string, tone?: 'success' | 'error') => void
  onRefresh: () => Promise<unknown>
  substanceNames: Map<string, string>
}) {
  const [filters, setFilters] = useState<Set<TimelineType>>(
    () => new Set(['administration', 'assessment', 'context', 'treatment']),
  )
  const [correcting, setCorrecting] = useState<AdministrationEvent | null>(null)
  const visible = useMemo(() => entries.filter((entry) => filters.has(entry.type)), [entries, filters])

  const toggleFilter = (type: TimelineType) =>
    setFilters((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  const voidEntry = async (entry: PharmacologyTimelineEntry) => {
    if (
      !window.confirm(
        `Void this ${entry.type}? It will remain in correction history but disappear from the active journal.`,
      )
    ) {
      return
    }
    try {
      if (entry.type === 'administration') await voidAdministration(entry.data.id)
      else if (entry.type === 'assessment') await voidAssessment(entry.data.id)
      else if (entry.type === 'context') await voidContextEvent(entry.data.id)
      else return
      notify(`${treatmentStageLabel(entry.type)} voided.`)
      await onRefresh()
    } catch (error) {
      notify(pharmacologyErrorMessage(error), 'error')
    }
  }

  return (
    <section class="timeline-section" aria-labelledby="timeline-heading">
      <div class="section-heading timeline-heading-row">
        <div>
          <h2 id="timeline-heading">Timeline</h2>
          <p>Scheduled times and observed times remain distinct.</p>
        </div>
        <div class="filter-chips" aria-label="Timeline filters">
          {(['administration', 'treatment', 'assessment', 'context'] as const).map((type) => (
            <button
              class={filters.has(type) ? 'choice-chip selected' : 'choice-chip'}
              key={type}
              type="button"
              aria-pressed={filters.has(type)}
              onClick={() => toggleFilter(type)}
            >
              {treatmentStageLabel(type)}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <div class="empty-state">No journal entries match these filters.</div>
      ) : (
        <div class="timeline-days">
          {groupTimelineByDay(visible).map(([day, dayEntries]) => (
            <section class="timeline-day" key={day}>
              <h3>{day}</h3>
              <div class="timeline-list">
                {dayEntries.map((entry) => (
                  <article class={`timeline-entry timeline-${entry.type}`} key={`${entry.type}:${entry.data.id}`}>
                    <time dateTime={entry.at}>
                      {new Date(entry.at).toLocaleTimeString([], { timeStyle: 'short' })}
                    </time>
                    <span class="timeline-marker" aria-hidden="true" />
                    <div class="timeline-content">
                      <div class="timeline-entry-heading">
                        <div>
                          <p class="treatments-kicker">{treatmentStageLabel(entry.type)}</p>
                          <h4>{entryTitle(entry, substanceNames)}</h4>
                        </div>
                        <span>{entryDetail(entry)}</span>
                      </div>
                      {entry.type === 'administration' && (
                        <p>{actualVsScheduledLabel(entry.data.administered_at, entry.data.scheduled_at)}</p>
                      )}
                      {entry.type === 'treatment' && entry.data.planned_at && (
                        <p>
                          Planned {new Date(entry.data.planned_at).toLocaleString()}
                          {entry.data.actual_start && ` · started ${new Date(entry.data.actual_start).toLocaleString()}`}
                        </p>
                      )}
                      {(entry.type === 'administration' || entry.type === 'assessment' || entry.type === 'context') && (
                        <div class="row-actions">
                          {entry.type === 'administration' && (
                            <button type="button" onClick={() => setCorrecting(entry.data)}>Correct</button>
                          )}
                          <button class="danger-link" type="button" onClick={() => void voidEntry(entry)}>Void</button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {correcting && (
        <div class="modal-backdrop" role="presentation">
          <div class="modal-sheet" role="dialog" aria-modal="true">
            <CorrectionForm
              administration={correcting}
              onCancel={() => setCorrecting(null)}
              onSaved={() => {
                setCorrecting(null)
                notify('Administration corrected.')
                void onRefresh()
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}
