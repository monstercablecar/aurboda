import type {
  PeopleEvent,
  PeopleEventBody,
  PeopleOptions,
  PeopleGuidance,
  Person,
  PeopleDashboard,
} from '@aurboda/api-spec'

import { useEffect, useRef, useState } from 'preact/hooks'

import { isManualEvent } from './manualEvent'
import { dateTimeInputToIso, ErrorMessage, localDateTime } from './ui'

// eslint-disable-next-line complexity -- Optional server-declared fields and saved values are presentation branches.
export function EventForm({
  type,
  event: suppliedEvent,
  options,
  saving,
  error,
  onSave,
  onCancel,
  onDelete,
  remindersAvailable = false,
  guidance = [],
  focusRequest = 0,
  initialPayload = {},
  episodes = [],
  milestones = [],
}: {
  type: PeopleEventBody['type']
  event?: PeopleEvent
  options: PeopleOptions
  saving: boolean
  error: unknown
  onSave: (body: PeopleEventBody) => void
  onCancel: () => void
  onDelete?: () => void
  guidance?: Pick<PeopleGuidance, 'id' | 'title'>[]
  focusRequest?: number
  initialPayload?: PeopleEventBody['payload']
  episodes?: NonNullable<Person['status_episodes']>
  milestones?: NonNullable<PeopleDashboard['care_milestones']>
  remindersAvailable?: boolean
}) {
  const event = suppliedEvent && isManualEvent(suppliedEvent) ? suppliedEvent : undefined
  const originalPayload = event?.payload ?? initialPayload
  const panelRef = useRef<HTMLElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const isGoal = type === 'goal'
  const [goalStatus, setGoalStatus] = useState<NonNullable<PeopleEventBody['payload']['goal_status']>>(
    originalPayload.goal_status ?? 'active',
  )
  const [targetDate, setTargetDate] = useState(originalPayload.target_date ?? '')
  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
    firstInputRef.current?.focus({ preventScroll: true })
  }, [focusRequest])
  const [episodeId, setEpisodeId] = useState(originalPayload.status_episode_id ?? '')
  const [careMetric, setCareMetric] = useState(originalPayload.care_metric ?? '')
  const [milestoneId, setMilestoneId] = useState(originalPayload.milestone_id ?? '')
  const [informationSource, setInformationSource] = useState<
    NonNullable<PeopleEventBody['payload']['information_source']> | ''
  >(originalPayload.information_source ?? '')
  const [careState, setCareState] = useState<NonNullable<PeopleEventBody['payload']['care_state']> | ''>(
    originalPayload.care_state ?? '',
  )
  const careDefinition = options.care_metric_definitions?.find((item) => item.id === careMetric)
  const selectedEpisode = episodes.find((item) => item.id === episodeId)
  const [inputError, setInputError] = useState<Error | null>(null)
  const [timestamp, setTimestamp] = useState(localDateTime(event?.timestamp ?? new Date().toISOString()))
  const [endTime, setEndTime] = useState(event?.end_time ? localDateTime(event.end_time) : '')
  const [note, setNote] = useState(originalPayload.note ?? '')
  const [title, setTitle] = useState(originalPayload.title ?? '')
  const [location, setLocation] = useState(originalPayload.location ?? '')
  const [value, setValue] = useState(originalPayload.value?.toString() ?? '')
  const [measurementType, setMeasurementType] = useState(originalPayload.measurement_type)
  const [diaperType, setDiaperType] = useState(originalPayload.diaper_type)
  const [unit, setUnit] = useState(originalPayload.unit ?? '')
  const [observation, setObservation] = useState<PeopleEventBody['payload']['observation']>(
    originalPayload.observation,
  )
  const [guidanceId, setGuidanceId] = useState(originalPayload.guidance_id ?? '')
  const [timeKind, setTimeKind] = useState<PeopleEventBody['payload']['time_kind']>(originalPayload.time_kind)
  const [reminderEnabled, setReminderEnabled] = useState(Boolean(event?.reminder_at))
  const [reminderTime, setReminderTime] = useState(event?.reminder_at ? localDateTime(event.reminder_at) : '')
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const reminderTimezone =
    event?.reminder_at && reminderTime === localDateTime(event.reminder_at)
      ? event.reminder_timezone
      : browserTimezone
  const fields = options.event_fields[type] ?? []
  return (
    <section class="people-panel" ref={panelRef}>
      <h2>
        {isGoal
          ? event
            ? 'Edit goal'
            : 'Add goal'
          : `${event ? 'Edit' : 'Record'} ${options.event_types.find((option) => option.value === type)?.label ?? type}`}
      </h2>
      <p class="people-muted">Entries are private to your account.</p>
      <form
        class="people-form"
        // eslint-disable-next-line complexity -- Serializes independent optional event fields without changing their meaning.
        onSubmit={(e) => {
          e.preventDefault()
          setInputError(null)
          try {
            onSave({
              type,
              timestamp: dateTimeInputToIso(timestamp, event?.timestamp) ?? '',
              end_time: dateTimeInputToIso(endTime, event?.end_time),
              reminder_at: reminderEnabled ? dateTimeInputToIso(reminderTime, event?.reminder_at) : null,
              reminder_timezone: reminderEnabled ? reminderTimezone : null,
              source: 'manual',
              payload: {
                ...originalPayload,
                status_episode_id: episodeId || undefined,
                care_metric: careMetric || undefined,
                milestone_id: milestoneId || undefined,
                information_source: informationSource || undefined,
                care_state: careState || undefined,
                note,
                title,
                location,
                ...(isGoal ? { goal_status: goalStatus, target_date: targetDate || undefined } : {}),
                value:
                  careMetric && careDefinition && careDefinition.value_kind !== 'rating'
                    ? undefined
                    : value === ''
                      ? undefined
                      : Number(value),
                unit: careDefinition ? careDefinition.unit : unit || undefined,
                observation,
                measurement_type: measurementType,
                diaper_type: diaperType,
                guidance_id: guidanceId || undefined,
                time_kind: timeKind,
              },
            })
          } catch (cause) {
            setInputError(cause instanceof Error ? cause : new Error('Check the date and time.'))
          }
        }}
      >
        {['observation', 'appointment', 'goal'].includes(type) &&
          (fields.includes('status_episode_id') || Boolean(episodeId)) &&
          (episodes.length > 0 || episodeId) && (
            <>
              <label>
                Related circumstance
                <select
                  value={episodeId}
                  onChange={(e) => {
                    setEpisodeId(e.currentTarget.value)
                    setCareMetric('')
                    setMilestoneId('')
                    setCareState('')
                    setValue('')
                    setInformationSource('')
                  }}
                >
                  <option value="">None</option>
                  {episodeId && !episodes.some((item) => item.id === episodeId) && (
                    <option value={episodeId}>Previously recorded circumstance</option>
                  )}
                  {episodes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {options.status_definitions?.find((definition) => definition.kind === item.kind)
                        ?.label ?? item.kind}{' '}
                      · {item.start_date} · {item.lifecycle}
                    </option>
                  ))}
                </select>
              </label>
              {type === 'observation' && episodeId && (
                <>
                  <label>
                    Care observation
                    <select
                      value={careMetric}
                      onChange={(e) => {
                        setCareMetric(e.currentTarget.value)
                        setMilestoneId('')
                        setCareState('')
                        setValue('')
                        setInformationSource('')
                      }}
                    >
                      <option value="">No metric / milestone update</option>
                      {careMetric && !careDefinition && (
                        <option value={careMetric}>Previously recorded care metric</option>
                      )}
                      {options.care_metric_definitions
                        ?.filter(
                          (item) =>
                            item.id === careMetric ||
                            (selectedEpisode && item.status_kinds.includes(selectedEpisode.kind)),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  {!careMetric && (
                    <label>
                      Milestone
                      <select value={milestoneId} onChange={(e) => setMilestoneId(e.currentTarget.value)}>
                        <option value="">No milestone</option>
                        {milestoneId &&
                          !milestones.some(
                            (item) =>
                              item.definition_id === milestoneId && item.status_episode_id === episodeId,
                          ) && <option value={milestoneId}>Previously recorded milestone</option>}
                        {milestones
                          .filter((item) => item.status_episode_id === episodeId)
                          .map((item) => (
                            <option key={item.definition_id} value={item.definition_id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {careDefinition && (
                    <>
                      <p>{careDefinition.description}</p>
                      {careDefinition.sensitive && (
                        <p class="people-muted">
                          Sensitive tracking requires appropriate agreement and voluntarily shared or shared
                          clinical information.{' '}
                          {selectedEpisode?.tracking_agreed
                            ? 'Agreement is recorded for this circumstance.'
                            : 'Agreement is not recorded. Update the circumstance before collecting new sensitive entries.'}
                        </p>
                      )}
                    </>
                  )}
                  {milestoneId && (
                    <p class="people-muted">
                      Milestone updates require appropriate agreement and voluntarily shared or shared
                      clinical information.{' '}
                      {selectedEpisode?.tracking_agreed
                        ? 'Agreement is recorded for this circumstance.'
                        : 'Agreement is not recorded. Update the circumstance before collecting new sensitive entries.'}{' '}
                      A recorded update does not imply completion.
                    </p>
                  )}
                  <label>
                    Information source
                    <select
                      required={Boolean(careMetric || milestoneId)}
                      value={informationSource}
                      onChange={(e) =>
                        setInformationSource(e.currentTarget.value as typeof informationSource)
                      }
                    >
                      <option value="">Choose source</option>
                      {(
                        careDefinition?.allowed_sources ??
                        (milestoneId
                          ? ['self_shared', 'clinical_shared']
                          : ['observed', 'self_shared', 'clinical_shared'])
                      ).map((source) => (
                        <option key={source} value={source}>
                          {
                            {
                              observed: 'Observed by me',
                              self_shared: 'Voluntarily shared by them',
                              clinical_shared: 'Shared clinical information',
                            }[source]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  {careDefinition?.value_kind === 'state' && (
                    <label>
                      Shared support preference
                      <select
                        required
                        value={careState}
                        onChange={(e) => setCareState(e.currentTarget.value as typeof careState)}
                      >
                        <option value="">Choose what was shared</option>
                        {careDefinition.states?.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </>
          )}
        <label>
          When
          <input
            required
            ref={isGoal ? undefined : firstInputRef}
            type="datetime-local"
            value={timestamp}
            onInput={(e) => setTimestamp(e.currentTarget.value)}
          />
        </label>
        {(isGoal || fields.includes('title')) && (
          <label>
            {isGoal ? 'Goal' : 'Title (optional)'}
            <input
              ref={isGoal ? firstInputRef : undefined}
              required={isGoal && !originalPayload.note?.trim()}
              maxLength={200}
              value={title}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </label>
        )}
        {isGoal && (
          <>
            <label>
              Goal status
              <select
                value={goalStatus}
                onChange={(e) => setGoalStatus(e.currentTarget.value as typeof goalStatus)}
              >
                {(
                  options.goal_statuses ?? [
                    { value: 'active', label: 'Active' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'paused', label: 'Paused' },
                  ]
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target date (optional)
              <input type="date" value={targetDate} onInput={(e) => setTargetDate(e.currentTarget.value)} />
            </label>
          </>
        )}
        {fields.includes('location') && (
          <label>
            Location (optional)
            <input maxLength={300} value={location} onInput={(e) => setLocation(e.currentTarget.value)} />
          </label>
        )}
        {fields.includes('end_time') && (
          <label>
            End time (optional)
            <input type="datetime-local" value={endTime} onInput={(e) => setEndTime(e.currentTarget.value)} />
          </label>
        )}
        {fields.includes('measurement_type') && (
          <label>
            Measurement type
            <select
              value={measurementType ?? ''}
              onChange={(e) =>
                setMeasurementType((e.currentTarget.value || undefined) as typeof measurementType)
              }
            >
              <option value="">Unclassified measurement</option>
              {(options.measurement_types ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {fields.includes('diaper_type') && (
          <label>
            Diaper type
            <select
              value={diaperType ?? ''}
              onChange={(e) => setDiaperType((e.currentTarget.value || undefined) as typeof diaperType)}
            >
              <option value="">Unclassified diaper</option>
              {(options.diaper_types ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {fields.includes('value') &&
          (['feeding', 'growth'].includes(type) || careDefinition?.value_kind === 'rating') && (
            <label>
              Value (optional)
              <input
                type="number"
                required={careDefinition?.value_kind === 'rating'}
                min={careDefinition?.min}
                max={careDefinition?.max}
                step="any"
                value={value}
                onInput={(e) => setValue(e.currentTarget.value)}
              />
            </label>
          )}
        {fields.includes('unit') && ['feeding', 'growth'].includes(type) && (
          <label>
            Unit
            <input maxLength={30} value={unit} onInput={(e) => setUnit(e.currentTarget.value)} />
          </label>
        )}
        {fields.includes('observation') && !careMetric && (
          <label>
            {milestoneId ? 'Milestone update state' : 'Observation'}
            <select
              value={observation ?? ''}
              onChange={(e) => setObservation((e.currentTarget.value || undefined) as typeof observation)}
            >
              <option value="">Choose observation state</option>
              {options.observation_states.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {fields.includes('guidance_id') && (
          <label>
            Related guidance (optional)
            <select value={guidanceId} onChange={(e) => setGuidanceId(e.currentTarget.value)}>
              <option value="">No specific reference</option>
              {guidanceId && !guidance.some((item) => item.id === guidanceId) && (
                <option value={guidanceId}>Saved reference</option>
              )}
              {guidance.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {fields.includes('time_kind') && (
          <label>
            Time together
            <select
              value={timeKind ?? ''}
              onChange={(e) => setTimeKind((e.currentTarget.value || undefined) as typeof timeKind)}
            >
              <option value="">Not specified</option>
              {options.time_kinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Notes (optional)
          <textarea maxLength={10000} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
        <fieldset class="people-choices">
          <legend>Optional reminder</legend>
          <label>
            <input
              type="checkbox"
              checked={reminderEnabled}
              disabled={!remindersAvailable && !reminderEnabled}
              onChange={(e) => setReminderEnabled(e.currentTarget.checked)}
            />
            Remind me
          </label>
          {!remindersAvailable && (
            <p class="people-muted">
              Reminders need the server scheduler and browser notifications to be configured.
            </p>
          )}
          {reminderEnabled && (
            <>
              <label>
                Reminder time
                <input
                  required
                  type="datetime-local"
                  disabled={!remindersAvailable}
                  value={reminderTime}
                  onInput={(e) => setReminderTime(e.currentTarget.value)}
                />
              </label>
              <p class="people-muted">
                Time zone: {browserTimezone}. Delivery is best effort. Enable browser notifications in{' '}
                <a href="/settings">Settings</a>.
              </p>
            </>
          )}
        </fieldset>
        {event && (
          <p class="people-muted">
            Revision {event.revision} · Recorded {new Date(event.recorded_at).toLocaleString()} · Private
          </p>
        )}
        <ErrorMessage error={inputError ?? error} />
        <div class="people-actions">
          <button class="people-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : isGoal ? 'Save goal' : 'Save entry'}
          </button>
          <button type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          {onDelete && (
            <button class="people-danger" type="button" disabled={saving} onClick={onDelete}>
              Delete entry
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
