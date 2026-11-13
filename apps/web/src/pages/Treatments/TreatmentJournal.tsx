import type {
  AdministrationEvent,
  Assessment,
  QuestionnaireTemplate,
  Substance,
  TreatmentSession,
  TreatmentType,
} from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useLocation } from 'preact-iso'
import { useState } from 'preact/hooks'

import { createTreatmentSession, pharmacologyErrorMessage, updateTreatmentSession } from '../../state/api'
import { AssessmentForm } from './AssessmentForm'
import { isoToLocalDateTime, localDateTimeToIso, treatmentStageLabel, treatmentUrl } from './model'
import { PrnForm } from './PrnForm'

const optionalTimestamp = (value: string) => (value ? localDateTimeToIso(value) : undefined)

const validateSessionTimes = (start: string, end: string) => {
  if (end && !start) throw new Error('Enter a start time before recording an end time.')
  if (end && localDateTimeToIso(end) < localDateTimeToIso(start)) {
    throw new Error('End time cannot be before start time.')
  }
}

// eslint-disable-next-line complexity -- generalized treatment form exposes independently optional session facts
export function TreatmentSessionForm({
  onCancel,
  onSaved,
  session,
  timezone,
  treatmentTypes,
}: {
  onCancel: () => void
  onSaved: (session: TreatmentSession) => void
  session?: TreatmentSession
  timezone: string
  treatmentTypes: TreatmentType[]
}) {
  const activeTypes = treatmentTypes.filter((type) => type.active || type.id === session?.treatment_type.id)
  const [typeId, setTypeId] = useState(session?.treatment_type.id ?? activeTypes[0]?.id ?? '')
  const [plannedLocal, setPlannedLocal] = useState(() =>
    session?.planned_at ? isoToLocalDateTime(session.planned_at) : '',
  )
  const [startLocal, setStartLocal] = useState(() =>
    session?.actual_start ? isoToLocalDateTime(session.actual_start) : '',
  )
  const [endLocal, setEndLocal] = useState(() =>
    session?.actual_end ? isoToLocalDateTime(session.actual_end) : '',
  )
  const [status, setStatus] = useState(session?.status ?? 'planned')
  const [setting, setSetting] = useState(session?.setting ?? '')
  const [provider, setProvider] = useState(session?.provider ?? '')
  const [intention, setIntention] = useState(session?.intention ?? '')
  const [concerns, setConcerns] = useState(session?.concerns ?? '')
  const [notes, setNotes] = useState(session?.notes ?? '')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      if (!typeId) throw new Error('Choose a treatment type.')
      validateSessionTimes(startLocal, endLocal)
      const common = {
        actual_end: optionalTimestamp(endLocal),
        actual_start: optionalTimestamp(startLocal),
        concerns: concerns || undefined,
        intention: intention || undefined,
        notes: notes || undefined,
        planned_at: optionalTimestamp(plannedLocal),
        provider: provider || undefined,
        setting: setting || undefined,
        status,
        timezone,
      }
      return session
        ? updateTreatmentSession(session.id, {
            ...common,
            actual_start: common.actual_start ?? null,
            actual_end: common.actual_end ?? null,
            planned_at: common.planned_at ?? null,
          })
        : createTreatmentSession({
            ...common,
            adverse_events: [],
            follow_up_hours: activeTypes.find((type) => type.id === typeId)?.default_follow_up_hours ?? [],
            metadata: {},
            treatment_type_id: typeId,
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
          <p class="treatments-kicker">Treatment journal</p>
          <h2>{session ? 'Edit session' : 'New treatment session'}</h2>
        </div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close treatment form">
          ×
        </button>
      </div>
      <div class="form-grid">
        <label class="field full-field">
          <span>Treatment type</span>
          <select
            required
            disabled={!!session}
            value={typeId}
            onChange={(event) => setTypeId((event.target as HTMLSelectElement).value)}
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
          <span>Planned for</span>
          <input
            type="datetime-local"
            value={plannedLocal}
            onInput={(event) => setPlannedLocal((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus((event.target as HTMLSelectElement).value as TreatmentSession['status'])
            }
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="incomplete">Incomplete</option>
            <option value="canceled">Canceled</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label class="field">
          <span>Actual start</span>
          <input
            type="datetime-local"
            value={startLocal}
            onInput={(event) => setStartLocal((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Actual end</span>
          <input
            type="datetime-local"
            value={endLocal}
            onInput={(event) => setEndLocal((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Setting</span>
          <input value={setting} onInput={(event) => setSetting((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Provider</span>
          <input
            value={provider}
            onInput={(event) => setProvider((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field full-field">
          <span>Intention</span>
          <textarea
            value={intention}
            onInput={(event) => setIntention((event.target as HTMLTextAreaElement).value)}
          />
        </label>
      </div>
      <details class="advanced-fields">
        <summary>Concerns and notes</summary>
        <div class="form-grid">
          <label class="field full-field">
            <span>Concerns</span>
            <textarea
              value={concerns}
              onInput={(event) => setConcerns((event.target as HTMLTextAreaElement).value)}
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
        <button class="btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save session'}
        </button>
      </div>
    </form>
  )
}

const momentOrder: QuestionnaireTemplate['moment'][] = [
  'pre_treatment',
  'post_treatment',
  'follow_up',
  'custom',
]

// eslint-disable-next-line complexity -- treatment journal renders configurable stages and three modal workflows
export function TreatmentJournal({
  administrations,
  assessments,
  notify,
  onRefresh,
  questionnaires,
  sessions,
  substances,
  timezone,
  treatmentTypes,
}: {
  administrations: AdministrationEvent[]
  assessments: Assessment[]
  notify: (message: string, tone?: 'success' | 'error', celebrationMessage?: string) => void
  onRefresh: () => Promise<unknown>
  questionnaires: QuestionnaireTemplate[]
  sessions: TreatmentSession[]
  substances: Substance[]
  timezone: string
  treatmentTypes: TreatmentType[]
}) {
  const { query, route } = useLocation()
  const selected = sessions.find((session) => session.id === query.treatment)
  const [editing, setEditing] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<QuestionnaireTemplate | null>(null)
  const [linkingAdministration, setLinkingAdministration] = useState(false)
  const createOpen = query.action === 'treatment' && !selected
  const closeCreate = () => route(treatmentUrl(query, { action: undefined }), true)
  const selectSession = (id?: string) =>
    route(treatmentUrl(query, { action: undefined, treatment: id, view: 'journal' }))
  const sessionAssessments = selected
    ? assessments.filter((assessment) => assessment.treatment_session_id === selected.id)
    : []
  const sessionAdministrations = selected
    ? administrations.filter((event) => event.treatment_session_id === selected.id)
    : []
  const treatmentTemplates = questionnaires
    .filter((template) => template.enabled && momentOrder.includes(template.moment))
    .sort((left, right) => momentOrder.indexOf(left.moment) - momentOrder.indexOf(right.moment))

  return (
    <section class="treatment-journal" aria-labelledby="sessions-heading">
      <div class="section-heading">
        <div>
          <h2 id="sessions-heading">Treatment sessions</h2>
          <p>Plan, document, and follow up from server-configured treatment types.</p>
        </div>
        <button
          class="btn-primary"
          type="button"
          onClick={() =>
            route(treatmentUrl(query, { action: 'treatment', treatment: undefined, view: 'journal' }))
          }
        >
          New session
        </button>
      </div>
      <aside class="safety-callout">
        <strong>Observational journal</strong>
        <span>
          This page records events and responses. It does not provide dosing, interaction, or causality
          advice.
        </span>
      </aside>
      <div class="journal-layout">
        <div class="session-list" aria-label="Treatment sessions">
          {sessions.length === 0 ? (
            <div class="empty-state compact-empty">No treatment sessions yet.</div>
          ) : (
            sessions.map((session) => (
              <button
                class={`session-list-item${selected?.id === session.id ? ' active' : ''}`}
                key={session.id}
                type="button"
                onClick={() => selectSession(session.id)}
              >
                <span>
                  <strong>{session.treatment_type.display_name}</strong>
                  <small>
                    {session.planned_at
                      ? new Date(session.planned_at).toLocaleDateString()
                      : new Date(session.created_at).toLocaleDateString()}
                  </small>
                </span>
                <span class={`due-badge due-${session.status}`}>{treatmentStageLabel(session.status)}</span>
              </button>
            ))
          )}
        </div>
        <div class="session-detail">
          {!selected ? (
            <div class="empty-state">
              <h3>Select a session</h3>
              <p>Its treatment stages, linked administrations, and follow-ups will appear here.</p>
            </div>
          ) : (
            <>
              <div class="session-detail-heading">
                <div>
                  <p class="treatments-kicker">{treatmentStageLabel(selected.status)}</p>
                  <h3>{selected.treatment_type.display_name}</h3>
                  <p>
                    {selected.planned_at
                      ? `Planned ${new Date(selected.planned_at).toLocaleString()}`
                      : 'Unscheduled session'}
                  </p>
                </div>
                <button class="btn-secondary compact-button" type="button" onClick={() => setEditing(true)}>
                  Edit
                </button>
              </div>
              {(selected.setting || selected.provider || selected.intention) && (
                <dl class="session-facts">
                  {selected.setting && (
                    <div>
                      <dt>Setting</dt>
                      <dd>{selected.setting}</dd>
                    </div>
                  )}
                  {selected.provider && (
                    <div>
                      <dt>Provider</dt>
                      <dd>{selected.provider}</dd>
                    </div>
                  )}
                  {selected.intention && (
                    <div>
                      <dt>Intention</dt>
                      <dd>{selected.intention}</dd>
                    </div>
                  )}
                </dl>
              )}
              <ol class="stage-flow">
                {treatmentTemplates
                  .filter((template) => template.moment === 'pre_treatment')
                  .map((template) => {
                    const done = sessionAssessments.some(
                      (assessment) => assessment.template_id === template.id,
                    )
                    return (
                      <li class={done ? 'complete' : ''} key={template.id}>
                        <span class="stage-index" />
                        <div>
                          <strong>{template.display_name}</strong>
                          <small>{done ? 'Completed' : 'Missing'}</small>
                        </div>
                        <button type="button" onClick={() => setActiveTemplate(template)}>
                          {done ? 'Add another' : 'Complete'}
                        </button>
                      </li>
                    )
                  })}
                <li class={sessionAdministrations.length > 0 ? 'complete' : ''}>
                  <span class="stage-index" />
                  <div>
                    <strong>Actual administration</strong>
                    <small>
                      {sessionAdministrations.length > 0
                        ? `${sessionAdministrations.length} linked`
                        : selected.status === 'canceled'
                          ? 'Session canceled'
                          : 'Not recorded'}
                    </small>
                  </div>
                  <button type="button" onClick={() => setLinkingAdministration(true)}>
                    Link
                  </button>
                </li>
                {treatmentTemplates
                  .filter((template) => template.moment !== 'pre_treatment')
                  .map((template) => {
                    const count = sessionAssessments.filter(
                      (assessment) => assessment.template_id === template.id,
                    ).length
                    return (
                      <li class={count > 0 ? 'complete' : ''} key={template.id}>
                        <span class="stage-index" />
                        <div>
                          <strong>{template.display_name}</strong>
                          <small>
                            {count > 0
                              ? `${count} completed`
                              : selected.status === 'canceled'
                                ? 'Canceled'
                                : 'Missing / upcoming'}
                          </small>
                        </div>
                        <button type="button" onClick={() => setActiveTemplate(template)}>
                          {count > 0 ? 'Add another' : 'Complete'}
                        </button>
                      </li>
                    )
                  })}
              </ol>
            </>
          )}
        </div>
      </div>

      {(createOpen || editing || activeTemplate || linkingAdministration) && (
        <div class="modal-backdrop" role="presentation">
          <div class="modal-sheet" role="dialog" aria-modal="true">
            {(createOpen || editing) && (
              <TreatmentSessionForm
                key={editing ? selected?.id : 'new'}
                session={editing ? selected : undefined}
                timezone={timezone}
                treatmentTypes={treatmentTypes}
                onCancel={() => (editing ? setEditing(false) : closeCreate())}
                onSaved={(saved) => {
                  setEditing(false)
                  notify('Treatment session saved.')
                  void onRefresh()
                  selectSession(saved.id)
                }}
              />
            )}
            {activeTemplate && selected && (
              <AssessmentForm
                stage={activeTemplate.moment}
                template={activeTemplate}
                timezone={timezone}
                treatmentSessionId={selected.id}
                onCancel={() => setActiveTemplate(null)}
                onSaved={() => {
                  notify(
                    `${activeTemplate.display_name} saved.`,
                    'success',
                    `${activeTemplate.display_name} is safely in your journal.`,
                  )
                  setActiveTemplate(null)
                  void onRefresh()
                }}
              />
            )}
            {linkingAdministration && selected && (
              <PrnForm
                substances={substances}
                timezone={timezone}
                treatmentSessionId={selected.id}
                onCancel={() => setLinkingAdministration(false)}
                onSaved={() => {
                  notify('Administration linked to the session.')
                  setLinkingAdministration(false)
                  void onRefresh()
                }}
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
