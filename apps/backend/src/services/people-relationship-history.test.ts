import type { PeopleEvent } from '@aurboda/api-spec'

import { peopleEventBodySchema, updatePeopleEventBodySchema } from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { relationshipTransitions } from './people-relationship-history.ts'
const now = new Date('2026-11-12T12:00:00Z')
const read = (events: ReturnType<typeof relationshipTransitions>): PeopleEvent[] =>
  events.map((event) => ({
    ...event,
    id: crypto.randomUUID(),
    person_id: crypto.randomUUID(),
    actor: 'test',
    privacy: 'private',
    revision: 1,
    recorded_at: event.timestamp,
    updated_at: event.timestamp,
  }))
describe('relationship state history', () => {
  test('treats selections as sets and records multiple additions and removals', () => {
    expect(relationshipTransitions(['a', 'b'], ['b', 'a', 'a'], [], now)).toEqual([])
    const initial = relationshipTransitions([], ['a', 'a', 'b'], [], now)
    expect(initial).toHaveLength(2)
    const ended = relationshipTransitions(['a', 'b'], [], read(initial), now)
    expect(ended.map((event) => event.payload.relationship_state)).toEqual(['a', 'b'])
    expect(ended.every((event) => event.payload.relationship_state_started_at === now.toISOString())).toBe(
      true,
    )
    expect(ended[0].timestamp).toBe('2026-11-12T12:00:00.001Z')
  })
  test('legacy removal has an unknown start and later reselection starts a new period', () => {
    const ended = relationshipTransitions(['a'], [], [], now)
    expect(ended[0].payload.relationship_state_started_at).toBeNull()
    const started = relationshipTransitions([], ['a'], read(ended), now)
    const again = relationshipTransitions(['a'], [], read([...ended, ...started]), now)
    expect(again[0].payload.relationship_state_started_at).toBe(started[0].timestamp)
    expect(again[0].timestamp).toBe('2026-11-12T12:00:00.002Z')
  })
  test('manual schemas cannot forge system events or payload metadata', () => {
    const system = relationshipTransitions([], ['a'], [], now)[0]
    expect(peopleEventBodySchema.safeParse(system).success).toBe(false)
    expect(updatePeopleEventBodySchema.safeParse({ source: 'system' }).success).toBe(false)
    expect(updatePeopleEventBodySchema.safeParse({ type: 'relationship_state' }).success).toBe(false)
    expect(peopleEventBodySchema.parse({ ...system, type: 'contact', source: 'manual' }).payload).toEqual({})
    expect(updatePeopleEventBodySchema.parse({ payload: system.payload }).payload).toEqual({})
  })
})
