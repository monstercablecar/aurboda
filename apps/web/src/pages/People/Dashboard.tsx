import type {
  PeopleDashboard,
  PeopleEvent,
  PeopleEventBody,
  PeopleGuidanceQuery,
  PeopleOptions,
  PeopleSource,
} from '@aurboda/api-spec'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { Celebration } from '../../components/Celebration'
import { nextCelebration, type CelebrationEvent } from '../../components/celebration-catalog'
import {
  createPeopleEvent,
  deletePeopleEvent,
  fetchPeopleEvents,
  fetchPeopleGuidance,
  peopleGuidanceFeedback,
  updatePeopleEvent,
  updatePerson,
} from '../../state/api/people'
import { EventForm } from './EventForm'
import { Goals } from './Goals'
import { GuidanceCard } from './Guidance'
import { isManualEvent } from './manualEvent'
import { ProfileDetails } from './ProfileDetails'
import { RelationshipStates } from './RelationshipStates'
import { StatusEpisodes } from './StatusEpisodes'
import { StatusSupport } from './StatusSupport'
import { ErrorMessage, Panel } from './ui'

type QueryRoot = readonly (string | undefined)[]

// eslint-disable-next-line complexity -- History presents independent optional classifications and provenance.
function EventClassification({
  event,
  options,
  dashboard,
}: {
  event: PeopleEvent
  options: PeopleOptions
  dashboard: PeopleDashboard
}) {
  const episode = dashboard.person.status_episodes?.find(
    (item) => item.id === event.payload.status_episode_id,
  )
  const milestone = dashboard.care_milestones?.find(
    (item) =>
      item.definition_id === event.payload.milestone_id &&
      item.status_episode_id === event.payload.status_episode_id,
  )
  return (
    <>
      {event.payload.care_metric && (
        <p>
          {options.care_metric_definitions?.find((item) => item.id === event.payload.care_metric)?.label ??
            'Care observation'}
        </p>
      )}
      {event.payload.status_episode_id && (
        <p>
          Circumstance:{' '}
          {episode
            ? `${options.status_definitions?.find((item) => item.kind === episode.kind)?.label ?? episode.kind} · ${episode.start_date}`
            : `Archived reference ${event.payload.status_episode_id}`}
        </p>
      )}
      {event.payload.milestone_id && (
        <p>Milestone: {milestone?.title ?? `Historical reference ${event.payload.milestone_id}`}</p>
      )}
      {event.payload.information_source && (
        <p>
          Information source:{' '}
          {
            {
              observed: 'Observed by me',
              self_shared: 'Voluntarily shared by them',
              clinical_shared: 'Shared clinical information',
            }[event.payload.information_source]
          }
        </p>
      )}
      {event.payload.care_state && <p>Shared preference: {event.payload.care_state.replaceAll('_', ' ')}</p>}
      {event.payload.measurement_type && (
        <p>
          {options.measurement_types?.find((option) => option.value === event.payload.measurement_type)
            ?.label ?? event.payload.measurement_type.replaceAll('_', ' ')}
        </p>
      )}
      {event.payload.diaper_type && (
        <p>
          {options.diaper_types?.find((option) => option.value === event.payload.diaper_type)?.label ??
            event.payload.diaper_type}
        </p>
      )}
    </>
  )
}

function RelationshipStateHistory({ event, options }: { event: PeopleEvent; options: PeopleOptions }) {
  return (
    <li>
      <strong>Relationship state {event.payload.relationship_state_change}</strong>
      <p>
        {options.statuses.find((option) => option.value === event.payload.relationship_state)?.label ??
          event.payload.relationship_state}
      </p>
      <p>
        Recorded change: <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
      </p>
      {event.payload.relationship_state_change === 'ended' && (
        <p>
          {event.payload.relationship_state_started_at ? (
            <>
              Started:{' '}
              <time dateTime={event.payload.relationship_state_started_at}>
                {new Date(event.payload.relationship_state_started_at).toLocaleString()}
              </time>
            </>
          ) : (
            'Start date unknown (selected before tracking began)'
          )}
        </p>
      )}
    </li>
  )
}

function EventHistory({
  dashboard,
  events,
  options,
  onEdit,
}: {
  dashboard: PeopleDashboard
  events: PeopleEvent[]
  options: PeopleOptions
  onEdit: (event: PeopleEvent) => void
}) {
  if (!events.length) return <p class="people-muted">No entries yet. Logging is always optional.</p>
  return (
    <ul class="people-history">
      {events.map((event) =>
        event.type === 'relationship_state' ? (
          <RelationshipStateHistory key={event.id} event={event} options={options} />
        ) : (
          <li key={event.id}>
            <strong>
              {options.event_types.find((option) => option.value === event.type)?.label ?? event.type}
            </strong>
            <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
            {event.reminder_at && (
              <p class="people-muted">
                Reminder:{' '}
                {new Date(event.reminder_at).toLocaleString(undefined, {
                  timeZone: event.reminder_timezone ?? undefined,
                })}{' '}
                ({event.reminder_timezone})
              </p>
            )}
            <EventClassification event={event} options={options} dashboard={dashboard} />
            {event.payload.title && <h3>{event.payload.title}</h3>}
            {event.payload.location && <p class="people-muted">{event.payload.location}</p>}
            {event.payload.note && <p class="people-preserve-lines">{event.payload.note}</p>}
            {event.payload.value !== undefined && (
              <p>
                {event.payload.value} {event.payload.unit}
              </p>
            )}
            {event.payload.observation && (
              <p>
                {options.observation_states.find((option) => option.value === event.payload.observation)
                  ?.label ?? event.payload.observation}
              </p>
            )}
            {isManualEvent(event) && <button onClick={() => onEdit(event)}>Review / correct entry</button>}
          </li>
        ),
      )}
    </ul>
  )
}

function Explore({
  id,
  queryRoot,
  options,
  sources,
  onFeedback,
  pending,
}: {
  id: string
  queryRoot: QueryRoot
  options: PeopleOptions
  sources: PeopleSource[]
  onFeedback: (guidance: { id: string; version: string }, action: 'completed' | 'dismissed') => void
  pending: boolean
}) {
  const [filters, setFilters] = useState<PeopleGuidanceQuery>({})
  const guidance = useQuery({
    queryKey: [...queryRoot, id, 'guidance', filters],
    queryFn: () => fetchPeopleGuidance(id, filters),
  })
  const setFilter = (name: keyof PeopleGuidanceQuery, value: string) =>
    setFilters((current) => ({ ...current, [name]: value || undefined }))
  return (
    <>
      <p>
        Explore all guidance applicable to this person, including suggestions you have completed or dismissed.
      </p>
      <div class="people-filters">
        <label>
          Topic
          <select value={filters.topic ?? ''} onChange={(e) => setFilter('topic', e.currentTarget.value)}>
            <option value="">All topics</option>
            {options.topics.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Life stage
          <select
            value={filters.life_stage ?? ''}
            onChange={(e) => setFilter('life_stage', e.currentTarget.value)}
          >
            <option value="">All applicable stages</option>
            {options.life_stages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            value={filters.relationship ?? ''}
            onChange={(e) => setFilter('relationship', e.currentTarget.value)}
          >
            <option value="">This person's relationship</option>
            {options.relationships.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Guidance type
          <select
            value={filters.guidance_type ?? ''}
            onChange={(e) => setFilter('guidance_type', e.currentTarget.value)}
          >
            <option value="">All types</option>
            {options.guidance_types.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select value={filters.source ?? ''} onChange={(e) => setFilter('source', e.currentTarget.value)}>
            <option value="">All sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.publisher}: {source.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {guidance.isPending && <p role="status">Loading guidance…</p>}
      <ErrorMessage error={guidance.error} />
      {guidance.data?.length === 0 && <p>No applicable guidance matches these filters.</p>}
      {guidance.data?.map((item) => (
        <GuidanceCard
          key={item.id}
          guidance={item}
          sources={sources}
          onFeedback={onFeedback}
          pending={pending}
        />
      ))}
    </>
  )
}

// eslint-disable-next-line complexity -- Dashboard sections render server-selected data with independent loading and editing states.
export function PersonDashboard({
  dashboard,
  options,
  sources,
  queryRoot,
  onEdit,
}: {
  dashboard: PeopleDashboard
  options: PeopleOptions
  sources: PeopleSource[]
  queryRoot: QueryRoot
  onEdit: () => void
}) {
  const { person, context } = dashboard
  const statusIds = new Set((dashboard.status_guidance ?? []).map((item) => item.id))
  const guideGroups = (dashboard.child_guide?.groups ?? []).map((group) => ({
    ...group,
    records: group.records.filter((item) => !statusIds.has(item.id)),
  }))
  const guideIds = new Set([
    ...statusIds,
    ...guideGroups.flatMap((group) => group.records.map((item) => item.id)),
  ])
  const outsideGuide = <T extends { id: string }>(items: T[]) =>
    items.filter((item) => !guideIds.has(item.id))
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryRoot })
  const [eventEditor, setEventEditor] = useState<{
    type: PeopleEventBody['type']
    event?: PeopleEvent
    initialPayload?: PeopleEventBody['payload']
  } | null>(null)
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const [showExplore, setShowExplore] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const history = useQuery({
    queryKey: [...queryRoot, person.id, 'events'],
    queryFn: () => fetchPeopleEvents(person.id),
    enabled: showHistory,
  })
  const saveEvent = useMutation({
    mutationFn: ({ body, previous }: { body: PeopleEventBody; previous?: PeopleEvent }) =>
      previous ? updatePeopleEvent(person.id, previous.id, body) : createPeopleEvent(person.id, body),
    onSuccess: async (_result, { body, previous }) => {
      if (
        body.type === 'goal' &&
        body.payload.goal_status === 'completed' &&
        previous?.payload.goal_status !== 'completed'
      )
        setCelebration(nextCelebration('goal-complete'))
      setEventEditor(null)
      await refresh()
    },
  })
  const removeEvent = useMutation({
    mutationFn: (eventId: string) => deletePeopleEvent(person.id, eventId),
    onSuccess: async () => {
      setEventEditor(null)
      await refresh()
    },
  })
  const metrics = useMutation({
    mutationFn: (enabled: string[]) =>
      updatePerson(person.id, { enabled_metrics: enabled, expected_updated_at: person.updated_at }),
    onSuccess: refresh,
  })
  const moduleVisibility = useMutation({
    mutationFn: (hidden: string[]) =>
      updatePerson(person.id, { hidden_modules: hidden, expected_updated_at: person.updated_at }),
    onSuccess: refresh,
  })
  const feedback = useMutation({
    mutationFn: ({
      guidance,
      action,
    }: {
      guidance: { id: string; version: string }
      action: 'completed' | 'dismissed'
    }) => peopleGuidanceFeedback(person.id, guidance.id, { action, version: guidance.version }),
    onSuccess: refresh,
  })
  const onFeedback = (guidance: { id: string; version: string }, action: 'completed' | 'dismissed') =>
    feedback.mutate({ guidance, action })
  const openEvent = (type: PeopleEventBody['type'], event?: PeopleEvent) => {
    saveEvent.reset()
    removeEvent.reset()
    setEventEditor({ type, event })
    setFocusRequest((current) => current + 1)
  }
  const editEvent = (event: PeopleEvent) => {
    if (isManualEvent(event)) openEvent(event.type, event)
  }
  const recordCare = (type: PeopleEventBody['type'], initialPayload: PeopleEventBody['payload']) => {
    saveEvent.reset()
    removeEvent.reset()
    setEventEditor({ type, initialPayload })
    setFocusRequest((value) => value + 1)
  }

  return (
    <>
      {celebration && (
        <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
      )}
      <header class="people-heading">
        <div>
          <h1>{person.preferred_name || person.name}</h1>
          <p class="people-muted">
            {options.relationships.find((option) => option.value === person.relationship)?.label ??
              person.relationship}{' '}
            · {context.age_display}
          </p>
        </div>
        <button onClick={onEdit}>Edit / settings</button>
      </header>
      <RelationshipStates key={person.id} person={person} options={options} queryRoot={queryRoot} />
      <ProfileDetails dashboard={dashboard} options={options} />
      <Panel title="Current focus">
        <p>{context.focus}</p>
      </Panel>
      {options.status_definitions && (
        <StatusEpisodes dashboard={dashboard} options={options} queryRoot={queryRoot} />
      )}
      <StatusSupport
        dashboard={dashboard}
        sources={sources}
        onRecord={recordCare}
        onFeedback={onFeedback}
        pending={feedback.isPending}
      />
      <ErrorMessage error={feedback.error} />
      {dashboard.child_guide && (
        <Panel title={dashboard.child_guide.title}>
          <p>{dashboard.child_guide.introduction}</p>
          <nav class="people-actions" aria-label="Child guide sections">
            {guideGroups.map((group) => (
              <a key={group.id} href={`#people-guide-${group.id}`}>
                {group.title}
              </a>
            ))}
            <a href="#people-metrics">Optional metrics</a>
            <a href="#people-goals">Goals</a>
          </nav>
          {[...guideGroups]
            .sort(
              (a, b) =>
                Number(!['safety', 'help'].includes(a.id)) - Number(!['safety', 'help'].includes(b.id)),
            )
            .map((group) => (
              <section key={group.id} id={`people-guide-${group.id}`} class="people-child-group">
                <h3>{group.title}</h3>
                <p>{group.description}</p>
                <div class="people-child-cards">
                  {group.records.map((item) => (
                    <GuidanceCard
                      key={item.id}
                      guidance={item}
                      sources={sources}
                      prominent={group.id === 'safety' || group.id === 'help'}
                      onFeedback={onFeedback}
                      pending={feedback.isPending}
                    />
                  ))}
                </div>
              </section>
            ))}
        </Panel>
      )}
      {(!dashboard.child_guide || outsideGuide(dashboard.current_guidance).length > 0) && (
        <Panel title="What matters">
          {dashboard.current_guidance.length ? (
            outsideGuide(dashboard.current_guidance).map((item) => (
              <GuidanceCard
                key={item.id}
                guidance={item}
                sources={sources}
                onFeedback={onFeedback}
                pending={feedback.isPending}
              />
            ))
          ) : (
            <p>No featured suggestions right now. You can still explore the applicable catalog.</p>
          )}
        </Panel>
      )}
      {dashboard.upcoming_events.length > 0 && (
        <Panel title="Upcoming plans">
          <EventHistory
            dashboard={dashboard}
            events={dashboard.upcoming_events}
            options={options}
            onEdit={editEvent}
          />
        </Panel>
      )}
      {outsideGuide(dashboard.practical_opportunities).length > 0 && (
        <Panel title="Practical opportunities">
          {outsideGuide(dashboard.practical_opportunities).map((item) => (
            <GuidanceCard
              key={item.id}
              guidance={item}
              sources={sources}
              onFeedback={onFeedback}
              pending={feedback.isPending}
            />
          ))}
        </Panel>
      )}
      {outsideGuide(dashboard.contextual_guidance ?? []).length > 0 && (
        <details class="people-panel">
          <summary>More guidance for this person</summary>
          {outsideGuide(dashboard.contextual_guidance).map((item) => (
            <GuidanceCard
              key={item.id}
              guidance={item}
              sources={sources}
              onFeedback={onFeedback}
              pending={feedback.isPending}
            />
          ))}
        </details>
      )}
      <Panel title="Quick actions">
        <p class="people-muted">Record what is useful to you. No daily logging is required.</p>
        <div class="people-actions">
          {dashboard.event_types.map((option) => (
            <button key={option.value} onClick={() => openEvent(option.value as PeopleEventBody['type'])}>
              {option.label}
            </button>
          ))}
        </div>
      </Panel>
      <Goals
        goals={dashboard.goals ?? dashboard.recent_activity.filter((event) => event.type === 'goal')}
        options={options}
        onAdd={() => openEvent('goal')}
        onEdit={editEvent}
      />
      {eventEditor && (
        <EventForm
          key={`${eventEditor.event?.id ?? eventEditor.type}:${eventEditor.initialPayload?.status_episode_id ?? ''}:${eventEditor.initialPayload?.care_metric ?? eventEditor.initialPayload?.milestone_id ?? ''}`}
          type={eventEditor.type}
          event={eventEditor.event}
          initialPayload={eventEditor.initialPayload}
          episodes={person.status_episodes ?? []}
          milestones={dashboard.care_milestones ?? []}
          options={options}
          focusRequest={focusRequest}
          remindersAvailable={dashboard.reminders_available}
          guidance={[
            ...new Map(
              [
                ...(dashboard.status_guidance ?? []),
                ...guideGroups.flatMap((group) => group.records),
                ...dashboard.current_guidance,
                ...dashboard.practical_opportunities,
                ...dashboard.developmental_context,
                ...(dashboard.contextual_guidance ?? []),
                ...dashboard.upcoming,
              ].map((item) => [item.id, item]),
            ).values(),
          ]}
          saving={saveEvent.isPending || removeEvent.isPending}
          error={saveEvent.error ?? removeEvent.error}
          onSave={(body) => saveEvent.mutate({ body, previous: eventEditor.event })}
          onCancel={() => setEventEditor(null)}
          onDelete={
            eventEditor.event
              ? () => {
                  if (
                    eventEditor.event &&
                    window.confirm(
                      'Delete this entry permanently? Its associated metric values will also be removed.',
                    )
                  ) {
                    removeEvent.mutate(eventEditor.event.id)
                  }
                }
              : undefined
          }
        />
      )}
      <Panel title="Optional metrics" id="people-metrics">
        <ErrorMessage error={metrics.error} />
        <div class="people-grid">
          {dashboard.metrics
            .filter((metric) => metric.enabled)
            .map((metric) => (
              <div key={metric.id}>
                <h3>{metric.label}</h3>
                <p class="people-stat">
                  {metric.display_value ??
                    (metric.value !== null
                      ? `${metric.value.toLocaleString()} ${metric.unit}`
                      : metric.window === 'current_state'
                        ? 'No matching goal entries'
                        : metric.window === 'last_24_hours' || metric.window === 'last_7_days'
                          ? 'No entries in this period'
                          : metric.event_type === 'goal'
                            ? 'No goals yet'
                            : 'No observations yet')}
                </p>
                {metric.window_label && <p>{metric.window_label}</p>}
                {metric.last_recorded_at && (
                  <p class="people-muted">
                    Last recorded:{' '}
                    <time dateTime={metric.last_recorded_at}>
                      {new Date(metric.last_recorded_at).toLocaleString()}
                    </time>
                  </p>
                )}
                <p class="people-muted">{metric.description}</p>
                <button
                  onClick={() =>
                    metric.care_metric && metric.status_episode_id
                      ? recordCare(metric.event_type, {
                          care_metric: metric.care_metric,
                          status_episode_id: metric.status_episode_id,
                        })
                      : openEvent(metric.event_type)
                  }
                >
                  {metric.event_type === 'goal'
                    ? 'Add goal'
                    : `Record ${options.event_types.find((option) => option.value === metric.event_type)?.label ?? metric.event_type}`}
                </button>
              </div>
            ))}
        </div>
        <details>
          <summary>Choose metrics</summary>
          {dashboard.metrics.map((metric) => (
            <label class="people-heading" key={metric.id}>
              <span>
                {metric.label}
                {metric.window_label && ` · ${metric.window_label}`}
                <small class="people-muted"> — {metric.description}</small>
              </span>
              <input
                type="checkbox"
                checked={metric.enabled}
                disabled={metrics.isPending}
                onChange={(e) =>
                  metrics.mutate(
                    e.currentTarget.checked
                      ? [...person.enabled_metrics, metric.id]
                      : person.enabled_metrics.filter((id) => id !== metric.id),
                  )
                }
              />
            </label>
          ))}
        </details>
      </Panel>
      {dashboard.available_modules.length > 0 && (
        <Panel title="Your reference areas">
          <ErrorMessage error={moduleVisibility.error} />
          <details>
            <summary>Choose reference areas</summary>
            {dashboard.available_modules.map((module) => (
              <label class="people-heading" key={module.id}>
                <span>
                  {module.title}
                  {!module.hideable && <small class="people-muted"> — always shown when applicable</small>}
                </span>
                <input
                  type="checkbox"
                  checked={!module.hideable || !person.hidden_modules.includes(module.id)}
                  disabled={!module.hideable || moduleVisibility.isPending}
                  onChange={(e) =>
                    moduleVisibility.mutate(
                      e.currentTarget.checked
                        ? person.hidden_modules.filter((id) => id !== module.id)
                        : [...person.hidden_modules, module.id],
                    )
                  }
                />
              </label>
            ))}
          </details>
          <div class="people-grid">
            {dashboard.modules.map((module) => (
              <div key={module.id}>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {(context.previous_checklist_months !== null || context.next_checklist_months !== null) && (
        <Panel title="Developmental monitoring">
          {context.previous_checklist_months !== null && (
            <p>Previous CDC checklist context: {context.previous_checklist_months} months.</p>
          )}
          {context.next_checklist_months !== null && (
            <p>Upcoming CDC checklist: {context.next_checklist_months} months.</p>
          )}
          {outsideGuide(dashboard.developmental_context).map((item) => (
            <GuidanceCard
              key={item.id}
              guidance={item}
              sources={sources}
              onFeedback={onFeedback}
              pending={feedback.isPending}
            />
          ))}
          <p class="people-muted">
            Optional observations support developmental monitoring; they are not a clinical screening or
            diagnosis.
          </p>
        </Panel>
      )}
      {dashboard.upcoming.length > 0 && (
        <Panel title="Upcoming reference guidance">
          {dashboard.upcoming.map((item) => (
            <GuidanceCard key={item.id} guidance={item} sources={sources} />
          ))}
        </Panel>
      )}
      <Panel title="History">
        {!showHistory && (
          <EventHistory
            dashboard={dashboard}
            events={dashboard.recent_activity}
            options={options}
            onEdit={editEvent}
          />
        )}
        <button onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? 'Close full history' : 'Review full history'}
        </button>
        {showHistory && (
          <>
            <ErrorMessage error={history.error} />
            {history.isPending && <p>Loading history…</p>}
            {history.data && (
              <EventHistory
                dashboard={dashboard}
                events={history.data}
                options={options}
                onEdit={editEvent}
              />
            )}
          </>
        )}
      </Panel>
      <Panel title="Explore">
        <p>{dashboard.guidance_count} applicable guidance records.</p>
        <button onClick={() => setShowExplore(!showExplore)}>
          {showExplore ? 'Close catalog' : 'Browse guidance and research'}
        </button>
        {showExplore && (
          <Explore
            id={person.id}
            queryRoot={queryRoot}
            options={options}
            sources={sources}
            onFeedback={onFeedback}
            pending={feedback.isPending}
          />
        )}
      </Panel>
    </>
  )
}
