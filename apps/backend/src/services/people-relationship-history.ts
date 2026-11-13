import type { PeopleEvent } from '@aurboda/api-spec'

type Transition = Pick<PeopleEvent, 'type' | 'source' | 'timestamp' | 'payload'>

/** Profile selection dates are recorded dates, never inferred relationship dates. */
export const relationshipTransitions = (
  before: string[],
  after: string[],
  history: PeopleEvent[],
  now = new Date(),
): Transition[] => {
  const previous = new Set(before)
  const next = new Set(after)
  const transitions = history
    .filter((event) => event.type === 'relationship_state' && event.source === 'system')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  const timestamp = new Date(
    transitions.reduce((latest, event) => Math.max(latest, Date.parse(event.timestamp) + 1), now.getTime()),
  ).toISOString()
  return [
    ...[...previous]
      .filter((state) => !next.has(state))
      .map((state): Transition => {
        const latest = transitions.find((event) => event.payload.relationship_state === state)
        return {
          type: 'relationship_state',
          source: 'system',
          timestamp,
          payload: {
            relationship_state: state,
            relationship_state_change: 'ended',
            relationship_state_started_at:
              latest?.payload.relationship_state_change === 'started' ? latest.timestamp : null,
          },
        }
      }),
    ...[...next]
      .filter((state) => !previous.has(state))
      .map(
        (state): Transition => ({
          type: 'relationship_state',
          source: 'system',
          timestamp,
          payload: {
            relationship_state: state,
            relationship_state_change: 'started',
            relationship_state_started_at: timestamp,
          },
        }),
      ),
  ]
}
