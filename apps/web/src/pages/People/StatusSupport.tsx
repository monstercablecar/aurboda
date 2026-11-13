import type { PeopleDashboard, PeopleSource, PeopleEventBody, PeopleGuidance } from '@aurboda/api-spec'

import { GuidanceCard } from './Guidance'
import { Panel } from './ui'

export function StatusSupport({
  dashboard,
  sources,
  onRecord,
  onFeedback,
  pending,
}: {
  onFeedback?: (guidance: PeopleGuidance, action: 'dismissed' | 'completed') => void
  pending?: boolean
  dashboard: PeopleDashboard
  sources: PeopleSource[]
  onRecord: (type: PeopleEventBody['type'], payload: PeopleEventBody['payload']) => void
}) {
  const records = dashboard.status_guidance ?? []
  const safety = records.filter((item) => item.guidance_type === 'safety' || item.child_section === 'help')
  const other = records.filter((item) => !safety.some((entry) => entry.id === item.id))
  const featured = other.filter((item) => !item.feedback).slice(0, 3)
  const remaining = other.filter((item) => !featured.some((entry) => entry.id === item.id))
  const card = (item: (typeof records)[number], prominent = false) => (
    <GuidanceCard
      key={item.id}
      guidance={item}
      sources={sources}
      prominent={prominent}
      onFeedback={onFeedback}
      pending={pending}
    />
  )
  return (
    <>
      {(records.length > 0 || (dashboard.care_milestones ?? []).length > 0) && (
        <nav class="people-actions" aria-label="Care sections">
          <a href="#people-circumstances">Circumstances</a>
          {records.length > 0 && <a href="#people-status-support">Support</a>}
          {(dashboard.care_milestones ?? []).length > 0 && <a href="#people-care-milestones">Milestones</a>}
          <a href="#people-metrics">Optional metrics</a>
          <a href="#people-goals">Goals</a>
        </nav>
      )}
      {records.length > 0 && (
        <Panel title="Support for current circumstances" id="people-status-support">
          <div class="people-child-cards">{safety.map((item) => card(item, true))}</div>
          {featured.map((item) => card(item))}
          {remaining.length > 0 && (
            <details>
              <summary>Show all {other.length} support suggestions</summary>
              {remaining.map((item) => card(item))}
            </details>
          )}
        </Panel>
      )}
      {(dashboard.care_milestones ?? []).length > 0 && (
        <Panel title="Care milestones" id="people-care-milestones">
          <p>
            Educational windows for discussion, not universal requirements. Recording an update does not
            schedule a reminder.
          </p>
          {dashboard.care_milestones?.map((item) => (
            <details key={`${item.status_episode_id}:${item.definition_id}`}>
              <summary>
                {item.title} · {item.state.replaceAll('_', ' ')}
              </summary>
              <p>{item.description}</p>
              {item.state === 'recorded' && (
                <p>
                  Recorded observation:{' '}
                  {dashboard.recent_activity
                    .find((event) => event.id === item.recorded_event_id)
                    ?.payload.observation?.replaceAll('_', ' ') ??
                    'An update was recorded; review event history for its contents.'}
                  . A recorded update does not imply completion.
                </p>
              )}
              <p>
                {item.window_label}
                {item.timing_date && ` · ${item.timing_date}`}
              </p>
              <div class="people-actions">
                <button
                  onClick={() =>
                    onRecord('observation', {
                      status_episode_id: item.status_episode_id,
                      milestone_id: item.definition_id,
                    })
                  }
                >
                  Record update
                </button>
                <button
                  onClick={() =>
                    onRecord('appointment', { status_episode_id: item.status_episode_id, title: item.title })
                  }
                >
                  Schedule appointment
                </button>
              </div>
              {item.evidence_ids.map((id) => {
                const source = sources.find((entry) => entry.id === id)
                return source ? (
                  <p key={id}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  </p>
                ) : (
                  <p key={id}>Source unavailable: {id}</p>
                )
              })}
            </details>
          ))}
        </Panel>
      )}
      {dashboard.care_ethics && (
        <Panel title={dashboard.care_ethics.title}>
          <p>{dashboard.care_ethics.summary}</p>
          <details>
            <summary>Care, agency and responsibility</summary>
            <ul>
              {dashboard.care_ethics.principles.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {dashboard.care_ethics.evidence_ids.map((id) => {
              const source = sources.find((item) => item.id === id)
              return source ? (
                <p key={id}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                </p>
              ) : null
            })}
          </details>
        </Panel>
      )}
    </>
  )
}
