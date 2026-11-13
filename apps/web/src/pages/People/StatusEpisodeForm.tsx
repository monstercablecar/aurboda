import type { Person, PeopleOptions } from '@aurboda/api-spec'

import { useState } from 'preact/hooks'

type Episode = NonNullable<Person['status_episodes']>[number]
// eslint-disable-next-line complexity -- Optional episode fields follow server definition capabilities.
export function StatusEpisodeForm({
  episode,
  options,
  saving,
  onSave,
  onCancel,
}: {
  episode: Partial<Episode>
  options: PeopleOptions
  saving: boolean
  onSave: (episode: Episode) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<Episode['kind'] | ''>(episode.kind ?? '')
  const [start, setStart] = useState(episode.start_date ?? '')
  const [end, setEnd] = useState(episode.estimated_end_date ?? '')
  const [resolved, setResolved] = useState(episode.resolved_date ?? '')
  const [phase, setPhase] = useState(episode.phase ?? '')
  const [intensity, setIntensity] = useState(episode.intensity ?? '')
  const [preferences, setPreferences] = useState(episode.preferences ?? '')
  const [source, setSource] = useState(episode.information_source ?? '')
  const [agreed, setAgreed] = useState(episode.tracking_agreed ?? false)
  const [retain, setRetain] = useState(episode.retain_metrics ?? false)
  const [anchor, setAnchor] = useState(
    episode.estimated_due_date ? 'due' : episode.gestational_age_days != null ? 'gestational' : '',
  )
  const [due, setDue] = useState(episode.estimated_due_date ?? '')
  const [weeks, setWeeks] = useState(
    episode.gestational_age_days != null ? String(Math.floor(episode.gestational_age_days / 7)) : '',
  )
  const [days, setDays] = useState(
    episode.gestational_age_days != null ? String(episode.gestational_age_days % 7) : '0',
  )
  const [asOf, setAsOf] = useState(episode.gestational_as_of ?? '')
  const [outcome, setOutcome] = useState(episode.outcome ?? '')
  const definition = options.status_definitions?.find((item) => item.kind === kind)
  const lifecycle = episode.lifecycle ?? 'active'
  return (
    <form
      class="people-form"
      // eslint-disable-next-line complexity -- Serializes independent optional episode fields and mutually exclusive timing anchors.
      onSubmit={(event) => {
        event.preventDefault()
        if (!kind || !source) return
        onSave({
          ...episode,
          id: episode.id ?? crypto.randomUUID(),
          kind,
          lifecycle,
          start_date: start,
          estimated_end_date: end || undefined,
          resolved_date: lifecycle !== 'active' ? resolved || undefined : undefined,
          phase: phase || undefined,
          intensity: definition?.supports_intensity
            ? ((intensity || undefined) as Episode['intensity'])
            : undefined,
          preferences: preferences || undefined,
          information_source: source as Episode['information_source'],
          tracking_agreed: agreed,
          retain_metrics: retain,
          estimated_due_date: kind === 'pregnant' && anchor === 'due' ? due : undefined,
          gestational_age_days:
            kind === 'pregnant' && anchor === 'gestational' ? Number(weeks) * 7 + Number(days) : undefined,
          gestational_as_of: kind === 'pregnant' && anchor === 'gestational' ? asOf : undefined,
          outcome:
            kind === 'pregnant' && lifecycle !== 'active'
              ? ((outcome || undefined) as Episode['outcome'])
              : undefined,
        })
      }}
    >
      <h3>
        {episode.id ? 'Update circumstance' : 'Add circumstance'}
        {lifecycle !== 'active' && ` — ${lifecycle}`}
      </h3>
      <label>
        Circumstance
        <select
          autoFocus
          required
          disabled={Boolean(episode.id)}
          value={kind}
          onChange={(e) => {
            setKind(e.currentTarget.value as Episode['kind'])
            setPhase('')
            setIntensity('')
          }}
        >
          <option value="">Choose circumstance</option>
          {options.status_definitions?.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {definition && <p>{definition.description}</p>}
      <label>
        Start date
        <input required type="date" value={start} onInput={(e) => setStart(e.currentTarget.value)} />
      </label>
      <label>
        How was this information shared?
        <select
          required
          value={source}
          onChange={(e) => setSource(e.currentTarget.value as Episode['information_source'])}
        >
          <option value="">Choose source</option>
          <option value="observed">Observed by me</option>
          <option value="self_shared">Voluntarily shared by them</option>
          <option value="clinical_shared">Shared clinical information</option>
        </select>
      </label>
      {lifecycle === 'resolved' && (
        <label>
          Resolution date (optional)
          <input type="date" value={resolved} onInput={(e) => setResolved(e.currentTarget.value)} />
        </label>
      )}
      {kind === 'pregnant' && lifecycle !== 'active' && (
        <label>
          Pregnancy outcome
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.currentTarget.value as NonNullable<Episode['outcome']>)}
          >
            <option value="">Choose what to record</option>
            <option value="birth">Birth</option>
            <option value="loss">Loss</option>
            <option value="other">Other</option>
            <option value="undisclosed">Prefer not to record details</option>
          </select>
        </label>
      )}
      <details open={kind === 'pregnant'}>
        <summary>More context (optional)</summary>
        <label>
          Estimated end date
          <input type="date" value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </label>
        <p class="people-muted">
          An estimated date does not resolve or change this circumstance automatically.
        </p>
        <label>
          Phase
          <select value={phase} onChange={(e) => setPhase(e.currentTarget.value)}>
            <option value="">Not specified / use available timing</option>
            {definition?.phases.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {definition?.supports_intensity && (
          <label>
            Intensity
            <select
              value={intensity}
              onChange={(e) => setIntensity(e.currentTarget.value as NonNullable<Episode['intensity']>)}
            >
              <option value="">Not specified</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
        )}
        <label>
          Support preferences
          <textarea
            maxLength={4000}
            value={preferences}
            onInput={(e) => setPreferences(e.currentTarget.value)}
          />
        </label>
        <label>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.currentTarget.checked)} />
          Appropriate agreement for optional sensitive tracking is in place
        </label>
        <p class="people-muted">
          For adults, ask their permission. For children who cannot consent, record only information
          appropriate to your caregiving responsibility; involve them as their understanding grows.
        </p>
        <label>
          <input type="checkbox" checked={retain} onChange={(e) => setRetain(e.currentTarget.checked)} />
          Keep selected metrics on the dashboard after this circumstance ends
        </label>
        {kind === 'pregnant' && (
          <>
            <label>
              Pregnancy timing
              <select value={anchor} onChange={(e) => setAnchor(e.currentTarget.value)}>
                <option value="">Unknown / not recorded</option>
                <option value="due">Estimated due date</option>
                <option value="gestational">Gestational age on a known date</option>
              </select>
            </label>
            {anchor === 'due' && (
              <label>
                Estimated due date
                <input required type="date" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
              </label>
            )}
            {anchor === 'gestational' && (
              <div class="people-grid">
                <label>
                  Weeks
                  <input
                    required
                    type="number"
                    min="0"
                    max="45"
                    value={weeks}
                    onInput={(e) => setWeeks(e.currentTarget.value)}
                  />
                </label>
                <label>
                  Additional days
                  <input
                    required
                    type="number"
                    min="0"
                    max="6"
                    value={days}
                    onInput={(e) => setDays(e.currentTarget.value)}
                  />
                </label>
                <label>
                  As of date
                  <input required type="date" value={asOf} onInput={(e) => setAsOf(e.currentTarget.value)} />
                </label>
              </div>
            )}
            <p class="people-muted">
              Timing is an estimate, not a clinical assessment. No outcome or postpartum transition is
              assumed.
            </p>
          </>
        )}
      </details>
      <div class="people-actions">
        <button disabled={saving} type="submit">
          Save circumstance
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
