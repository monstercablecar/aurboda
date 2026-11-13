import type {
  CreatePersonBody,
  Person,
  PeopleEvent,
  PeopleEventBody,
  PeopleFeedbackBody,
} from '@aurboda/api-spec'

import { randomUUID } from 'node:crypto'

import type { Queryable } from './pool.ts'

import { query, withUserTransaction } from './connection.ts'

type ProfileRow = { id: string; profile: CreatePersonBody; created_at: Date; updated_at: Date }
type EventContent = Omit<
  PeopleEvent,
  'id' | 'person_id' | 'actor' | 'privacy' | 'revision' | 'recorded_at' | 'updated_at'
>
type EventRow = {
  id: string
  person_id: string
  actor: string
  event: EventContent
  recorded_at: Date
  updated_at: Date
  revision: number
}
const profile = (r: ProfileRow): Person => ({
  ...r.profile,
  id: r.id,
  created_at: r.created_at.toISOString(),
  updated_at: r.updated_at.toISOString(),
})
const event = (r: EventRow): PeopleEvent => ({
  ...r.event,
  id: r.id,
  person_id: r.person_id,
  actor: r.actor,
  privacy: 'private',
  revision: r.revision,
  recorded_at: r.recorded_at.toISOString(),
  updated_at: r.updated_at.toISOString(),
})
export const listPeople = async (user: string) =>
  (await query<ProfileRow>(user, 'SELECT * FROM people ORDER BY created_at,id')).rows.map(profile)
export const getPerson = async (db: string | Queryable, id: string) => {
  const r = await query<ProfileRow>(db, 'SELECT * FROM people WHERE id=$1', [id])
  return r.rows[0] ? profile(r.rows[0]) : null
}
export const createPerson = async (user: string | Queryable, body: CreatePersonBody) =>
  profile(
    (
      await query<ProfileRow>(user, 'INSERT INTO people(id,profile) VALUES($1,$2) RETURNING *', [
        randomUUID(),
        body,
      ])
    ).rows[0],
  )
export const updatePerson = async (db: string | Queryable, id: string, body: CreatePersonBody) => {
  const r = await query<ProfileRow>(
    db,
    "UPDATE people SET profile=$2,updated_at=GREATEST(NOW(), updated_at + INTERVAL '1 millisecond') WHERE id=$1 RETURNING *",
    [id, body],
  )
  return r.rows[0] ? profile(r.rows[0]) : null
}
export const deletePerson = async (user: string, id: string) =>
  (await query(user, 'DELETE FROM people WHERE id=$1', [id])).rowCount !== 0
export const listEvents = async (db: string | Queryable, id: string) =>
  (
    await query<EventRow>(
      db,
      "SELECT * FROM people_events WHERE person_id=$1 ORDER BY (event->>'timestamp')::timestamptz DESC,id",
      [id],
    )
  ).rows.map(event)
export interface PeopleFeedback {
  guidance_id: string
  version: string
  action: 'dismissed' | 'completed'
  recorded_at: Date
}
export const listFeedback = async (user: string, id: string) =>
  (await query<PeopleFeedback>(user, 'SELECT * FROM people_feedback WHERE person_id=$1', [id])).rows
export const saveFeedback = async (user: string, id: string, guidance: string, body: PeopleFeedbackBody) => {
  await query(
    user,
    'INSERT INTO people_feedback(person_id,guidance_id,version,action) VALUES($1,$2,$3,$4) ON CONFLICT(person_id,guidance_id) DO UPDATE SET version=$3,action=$4,recorded_at=NOW()',
    [id, guidance, body.version, body.action],
  )
}
export const peopleTransaction = withUserTransaction
export const lockPerson = async (tx: Queryable, id: string) =>
  (await query(tx, 'SELECT id FROM people WHERE id=$1 FOR UPDATE', [id])).rows.length > 0
export const insertEvent = async (tx: Queryable, id: string, user: string, body: EventContent) =>
  event(
    (
      await query<EventRow>(
        tx,
        'INSERT INTO people_events(id,person_id,actor,event) VALUES($1,$2,$3,$4) RETURNING *',
        [randomUUID(), id, user, body],
      )
    ).rows[0],
  )
export const updateEvent = async (tx: Queryable, id: string, eventId: string, body: PeopleEventBody) => {
  const r = await query<EventRow>(
    tx,
    'UPDATE people_events SET event=$3,revision=revision+1,updated_at=NOW() WHERE person_id=$1 AND id=$2 RETURNING *',
    [id, eventId, body],
  )
  return r.rows[0] ? event(r.rows[0]) : null
}
export const deleteEvent = async (tx: Queryable, id: string, eventId: string) =>
  (await query(tx, 'DELETE FROM people_events WHERE person_id=$1 AND id=$2', [id, eventId])).rowCount !== 0
export const replaceMetricPoints = async (
  tx: Queryable,
  id: string,
  points: { metric: string; time: string; value: number; unit: string }[],
) => {
  await query(tx, 'DELETE FROM people_metric_points WHERE person_id=$1', [id])
  for (const p of points) {
    await query(
      tx,
      'INSERT INTO people_metric_points(person_id,metric,time,value,unit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(person_id,metric,time) DO UPDATE SET value=people_metric_points.value+EXCLUDED.value',
      [id, `p_${id.replaceAll('-', '')}_${p.metric}`, p.time, p.value, p.unit],
    )
  }
}
