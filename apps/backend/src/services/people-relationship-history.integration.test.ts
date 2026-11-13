import { createPersonBodySchema, peopleEventBodySchema } from '@aurboda/api-spec'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { _setDbForUser } from '../db/connection.ts'
import { createRolePool } from '../db/pool.ts'
import {
  startTestDb,
  stopTestDb,
  getTestUser,
  getTestDbClient,
  createTestDatabase,
} from '../test/db-test-helper.ts'
import * as people from './people.ts'
const profile = (statuses: string[] = []) =>
  createPersonBodySchema.parse({
    name: 'History test',
    relationship: 'friend',
    needs: ['maintain_friendship'],
    date_of_birth: '1990-01-01',
    statuses,
  })
describe('atomic relationship history persistence', () => {
  beforeAll(startTestDb, 120000)
  afterAll(stopTestDb)
  beforeEach(async () => {
    await getTestDbClient().query('TRUNCATE people CASCADE')
  })
  test('records initial states, ignores reorder, closes and reopens periods, preserves history', async () => {
    const user = getTestUser()
    const person = await people.createPerson(user, profile(['established', 'long_distance', 'established']))
    expect(await people.listEvents(user, person.id)).toHaveLength(2)
    await people.updatePerson(user, person.id, { statuses: ['long_distance', 'established'], notes: 'Edit' })
    expect(await people.listEvents(user, person.id)).toHaveLength(2)
    await people.updatePerson(user, person.id, { statuses: [] })
    const history = await people.listEvents(user, person.id)
    expect(history).toHaveLength(4)
    expect(
      history
        .filter((event) => event.payload.relationship_state_change === 'ended')
        .every((event) => event.payload.relationship_state_started_at !== null),
    ).toBe(true)
    await people.updatePerson(user, person.id, { statuses: ['established'], relationship: 'spouse' })
    expect(await people.listEvents(user, person.id)).toHaveLength(5)
    const dashboard = await people.getDashboard(user, person.id, new Date(Date.now() + 1000))
    expect(dashboard.recent_activity).toHaveLength(5)
    expect(dashboard.shared_time_minutes).toBe(0)
    expect(dashboard.metrics.every((metric) => metric.value === null)).toBe(true)
    await people.createEvent(
      user,
      person.id,
      peopleEventBodySchema.parse({ type: 'contact', timestamp: new Date().toISOString() }),
    )
    const points = await getTestDbClient().query(
      'SELECT metric FROM people_metric_points WHERE person_id=$1',
      [person.id],
    )
    expect(points.rows).toHaveLength(1)
    expect(points.rows[0].metric).toMatch(/_contact$/)
  })
  test('legacy removals stay unknown and stale edits write nothing', async () => {
    const user = getTestUser()
    const person = await people.createPerson(user, profile())
    await getTestDbClient().query(
      "UPDATE people SET profile=jsonb_set(profile, '{statuses}', '[\"established\"]') WHERE id=$1",
      [person.id],
    )
    await people.updatePerson(user, person.id, { statuses: [] })
    expect((await people.listEvents(user, person.id))[0].payload.relationship_state_started_at).toBeNull()
    await expect(
      people.updatePerson(user, person.id, {
        statuses: ['established'],
        expected_updated_at: person.updated_at,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await people.listEvents(user, person.id)).toHaveLength(1)
  })
  test('system history cannot be edited, deleted, or forged through shared writes', async () => {
    const user = getTestUser()
    const person = await people.createPerson(user, profile(['established']))
    const event = (await people.listEvents(user, person.id))[0]
    await expect(people.updateEvent(user, person.id, event.id, { type: 'contact' })).rejects.toMatchObject({
      status: 409,
    })
    await expect(people.deleteEvent(user, person.id, event.id)).rejects.toMatchObject({ status: 409 })
    await expect(people.createEvent(user, person.id, event as never)).rejects.toMatchObject({ status: 400 })
    expect(await people.listEvents(user, person.id)).toHaveLength(1)
  })
  test('history remains inside the owner database', async () => {
    const person = await people.createPerson(getTestUser(), profile(['established']))
    const otherDb = await createTestDatabase()
    const pool = createRolePool({ connectionString: otherDb.uri, max: 2 })
    _setDbForUser('other_history_user', pool)
    try {
      await expect(people.listEvents('other_history_user', person.id)).rejects.toMatchObject({ status: 404 })
      await expect(
        people.updatePerson('other_history_user', person.id, { statuses: [] }),
      ).rejects.toMatchObject({ status: 404 })
      expect(await people.listEvents(getTestUser(), person.id)).toHaveLength(1)
    } finally {
      await pool.end()
      await otherDb.drop()
    }
  }, 30000)
  test('event insertion failures roll back both create and patch', async () => {
    const user = getTestUser()
    const person = await people.createPerson(user, profile())
    const client = getTestDbClient()
    await client.query(
      "CREATE FUNCTION reject_relationship_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test history failure'; END $$",
    )
    await client.query(
      'CREATE TRIGGER reject_relationship_history BEFORE INSERT ON people_events FOR EACH ROW EXECUTE FUNCTION reject_relationship_history()',
    )
    try {
      await expect(people.updatePerson(user, person.id, { statuses: ['established'] })).rejects.toThrow(
        'test history failure',
      )
      await expect(people.createPerson(user, profile(['established']))).rejects.toThrow(
        'test history failure',
      )
      expect((await people.requirePerson(user, person.id)).statuses).toEqual([])
      expect(await people.listPeople(user)).toHaveLength(1)
      expect(await people.listEvents(user, person.id)).toEqual([])
    } finally {
      await client.query('DROP TRIGGER reject_relationship_history ON people_events')
      await client.query('DROP FUNCTION reject_relationship_history()')
    }
  })
})
