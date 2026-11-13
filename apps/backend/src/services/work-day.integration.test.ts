import { builtInRecruitingProfile, computeWorkDayTotals, type WorkDayBody } from '@aurboda/api-spec'
import { beforeAll, afterAll, beforeEach, expect, test } from 'vitest'

import { _setDbForUser } from '../db/connection.ts'
import { getNotesByEntityIds, getNotesForEntity } from '../db/notes.ts'
import { createRolePool } from '../db/pool.ts'
import {
  startTestDb,
  stopTestDb,
  getTestDbClient,
  getTestUser,
  createTestDatabase,
} from '../test/db-test-helper.ts'
import { queryActivities } from './queries/activities.ts'
import { saveWorkDay } from './work-day.ts'
const body = (note = 'Work note'): WorkDayBody => {
  const values = { offers_accepted: { server: 2 } }
  return {
    profile_id: 'recruiting',
    work_date: '2026-03-08',
    timestamp: '2026-03-08T18:00:00Z',
    values,
    totals: computeWorkDayTotals(builtInRecruitingProfile, values),
    note,
  }
}
beforeAll(startTestDb, 120000)
afterAll(stopTestDb)
beforeEach(async () => {
  await getTestDbClient().query('TRUNCATE time_series,notes,activities,user_settings,custom_metrics CASCADE')
})
test('concurrent first saves and retries produce one canonical activity and owned note pair', async () => {
  const user = getTestUser(),
    input = body(),
    results = await Promise.all([saveWorkDay(user, input), saveWorkDay(user, input)])
  expect(results[0].activity_id).toBe(results[1].activity_id)
  await saveWorkDay(user, input)
  expect((await getTestDbClient().query('SELECT * FROM activities')).rows).toHaveLength(1)
  expect((await getTestDbClient().query('SELECT * FROM notes')).rows).toHaveLength(2)
  expect((await getTestDbClient().query('SELECT * FROM time_series')).rows).toHaveLength(
    Object.keys(input.totals).length,
  )
  expect(
    (await getTestDbClient().query("SELECT value FROM time_series WHERE metric='work_hires'")).rows[0].value,
  ).toBe(2)
  const corrected = await saveWorkDay(user, { ...input, timestamp: '2026-03-08T19:00:00Z', note: 'Changed' })
  expect(corrected.timestamp).toBe('2026-03-08T18:00:00.000Z')
})
test('saved and corrected Work notes remain readable through single and batch entity queries', async () => {
  const user = getTestUser()
  const input = body()
  const saved = await saveWorkDay(user, input)
  for (const content of [input.note, 'Corrected Work note']) {
    if (content !== input.note) await saveWorkDay(user, { ...input, note: content })
    const activities = await queryActivities(
      user,
      ['work_entry'],
      new Date('2026-03-08T00:00:00Z'),
      new Date('2026-03-09T00:00:00Z'),
    )
    expect(activities).toHaveLength(1)
    expect(activities[0].id).toBe(saved.activity_id)
    expect(activities[0].comments).toHaveLength(1)
    expect(activities[0].comments[0]).toMatchObject({ content, source: 'work_day' })
    for (const [entityType, entityId] of [
      ['activity', saved.activity_id],
      ['metric', `${saved.timestamp}|work_day_logged|career_tracker`],
    ] as const) {
      const notes = await getNotesForEntity(user, entityType, entityId)
      expect(notes).toHaveLength(1)
      expect(notes[0]).toMatchObject({
        content,
        source: 'work_day',
        entity_type: entityType,
        entity_id: entityId,
      })
      const batch = await getNotesByEntityIds(user, entityType, [entityId])
      expect(batch.get(entityId)).toEqual(notes)
    }
  }
})
test('a note failure after metric writes rolls the entire day back', async () => {
  const db = getTestDbClient()
  await db.query(
    "CREATE FUNCTION fail_work_note() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$ LANGUAGE plpgsql; CREATE TRIGGER fail_work_note BEFORE INSERT ON notes FOR EACH ROW EXECUTE FUNCTION fail_work_note()",
  )
  try {
    await expect(saveWorkDay(getTestUser(), body())).rejects.toThrow('test failure')
    expect((await db.query('SELECT * FROM time_series')).rows).toEqual([])
    expect((await db.query('SELECT * FROM activities')).rows).toEqual([])
    expect((await db.query('SELECT * FROM custom_metrics')).rows).toEqual([])
  } finally {
    await db.query('DROP TRIGGER fail_work_note ON notes; DROP FUNCTION fail_work_note()')
  }
})
test('soft-deleted metrics reject without resurrection or partial updates', async () => {
  const input = body(),
    db = getTestDbClient()
  await saveWorkDay(getTestUser(), input)
  await db.query("UPDATE time_series SET deleted_at=NOW() WHERE metric='work_hires'")
  await expect(saveWorkDay(getTestUser(), { ...input, note: 'Must not commit' })).rejects.toMatchObject({
    status: 409,
  })
  expect(
    (await db.query("SELECT deleted_at FROM time_series WHERE metric='work_hires'")).rows[0].deleted_at,
  ).not.toBeNull()
  expect((await db.query('SELECT data FROM activities')).rows[0].data.note).toBe('Work note')
})
test('unrelated comments and noncanonical activity history survive corrections and clearing', async () => {
  const db = getTestDbClient(),
    input = body(),
    saved = await saveWorkDay(getTestUser(), input)
  await db.query(
    "INSERT INTO notes(entity_type,entity_id,content,created_at) VALUES('metric',$1,'Unrelated note','2000-01-01')",
    [`${saved.timestamp}|work_day_logged|career_tracker`],
  )
  await db.query(
    "INSERT INTO activities(source,external_id,activity_type,start_time,data) VALUES('aurboda','historical-duplicate','work_entry','2026-03-08T17:00:00Z',$1)",
    [{ profile_id: 'recruiting', work_date: input.work_date, note: 'Historical', updated_at: '2000-01-01' }],
  )
  await saveWorkDay(getTestUser(), { ...input, note: '' })
  expect((await db.query('SELECT content FROM notes')).rows).toEqual([{ content: 'Unrelated note' }])
  expect((await db.query('SELECT * FROM activities')).rows).toHaveLength(2)
  expect(
    (await db.query('SELECT data FROM activities WHERE id=$1', [saved.activity_id])).rows[0].data.note,
  ).toBe('')
})
test('legacy default entry identity and timestamp are retained and matching user note is adopted', async () => {
  const db = getTestDbClient(),
    input = body()
  await db.query(
    "INSERT INTO activity_type_definitions(name,display_name,display_category) VALUES('work_entry','Work entry','productivity') ON CONFLICT DO NOTHING",
  )
  const old = await db.query(
    "INSERT INTO activities(source,activity_type,start_time,data) VALUES('aurboda','work_entry','2026-03-08T17:00:00Z',$1) RETURNING id",
    [{ work_date: input.work_date, note: 'Legacy note', values: input.values }],
  )
  await db.query(
    "INSERT INTO notes(entity_type,entity_id,content) VALUES('metric','2026-03-08T17:00:00.000Z|work_day_logged|career_tracker','Legacy note')",
  )
  const saved = await saveWorkDay(getTestUser(), input)
  expect(saved.activity_id).toBe(old.rows[0].id)
  expect(saved.timestamp).toBe('2026-03-08T17:00:00.000Z')
  expect((await db.query("SELECT * FROM notes WHERE entity_type='metric'")).rows).toHaveLength(1)
})
test('ambiguous metric-only legacy timestamps reject; one timestamp is reused', async () => {
  const db = getTestDbClient()
  await db.query(
    "INSERT INTO time_series(time,metric,value,unit,source) VALUES('2026-03-08T17:00:00Z','work_day_logged',1,'count','career_tracker')",
  )
  expect((await saveWorkDay(getTestUser(), body())).timestamp).toBe('2026-03-08T17:00:00.000Z')
  await db.query('DELETE FROM activities')
  await db.query(
    "INSERT INTO time_series(time,metric,value,unit,source) VALUES('2026-03-08T19:00:00Z','work_day_logged',1,'count','career_tracker')",
  )
  await expect(saveWorkDay(getTestUser(), body())).rejects.toMatchObject({ status: 409 })
})
test('empty/zero grids work; configured ranges, unknown rows/metrics and dates reject', async () => {
  const input = body(),
    empty = { ...input, values: {}, totals: computeWorkDayTotals(builtInRecruitingProfile, {}) }
  await saveWorkDay(getTestUser(), empty)
  expect(
    (await getTestDbClient().query("SELECT value FROM time_series WHERE metric='work_hires'")).rows[0].value,
  ).toBe(0)
  await getTestDbClient().query("UPDATE custom_metrics SET max_value=1 WHERE name='work_hires'")
  await expect(saveWorkDay(getTestUser(), input)).rejects.toMatchObject({ status: 400 })
  for (const invalid of [
    { ...input, values: { foreign: { server: 1 } } },
    { ...input, totals: { ...input.totals, heart_rate: 100 } },
    { ...input, timestamp: '2026-03-10T12:00:00Z' },
    { ...input, values: { offers_accepted: { server: -1 } } },
  ]) {
    await expect(saveWorkDay(getTestUser(), invalid)).rejects.toMatchObject({ status: 400 })
  }
})
test('configured archived profile is retained and separate user databases remain isolated', async () => {
  const profile = { ...builtInRecruitingProfile, id: 'historic', status: 'archived' as const },
    input = { ...body(), profile_id: 'historic' }
  await getTestDbClient().query('INSERT INTO user_settings(settings) VALUES($1)', [
    { work: { version: 1, active_profile_id: 'historic', profiles: [profile] } },
  ])
  // Stored configurations validate lifecycle consistency, so keep another active profile selected.
  await getTestDbClient().query('UPDATE user_settings SET settings=$1', [
    { work: { version: 1, active_profile_id: 'recruiting', profiles: [builtInRecruitingProfile, profile] } },
  ])
  const result = await saveWorkDay(getTestUser(), input)
  const other = await createTestDatabase(),
    pool = createRolePool({ connectionString: other.uri, max: 2 })
  _setDbForUser('work_other', pool)
  try {
    await expect(saveWorkDay('work_other', input)).rejects.toMatchObject({ status: 404 })
    expect((await pool.query('SELECT * FROM activities WHERE id=$1', [result.activity_id])).rows).toEqual([])
  } finally {
    await pool.end()
    await other.drop()
  }
}, 30000)

test('activity notifier sees committed state and its failure cannot undo the save', async () => {
  let committed = false
  const result = await saveWorkDay(getTestUser(), body(), async () => {
    committed = (await getTestDbClient().query('SELECT id FROM activities')).rows.length === 1
    throw new Error('notifier unavailable')
  })
  expect(committed).toBe(true)
  expect(
    (await getTestDbClient().query('SELECT id FROM activities WHERE id=$1', [result.activity_id])).rows,
  ).toHaveLength(1)
})

test('built-in metrics cannot shadow health definitions or bypass source restrictions', async () => {
  const profile = {
    ...builtInRecruitingProfile,
    storage_contract: { ...builtInRecruitingProfile.storage_contract, day_marker_metric: 'steps' },
  }
  await getTestDbClient().query('INSERT INTO user_settings(settings) VALUES($1)', [
    { work: { version: 1, active_profile_id: profile.id, profiles: [profile] } },
  ])
  await expect(
    saveWorkDay(getTestUser(), { ...body(), totals: computeWorkDayTotals(profile, body().values) }),
  ).rejects.toMatchObject({ status: 400 })
  expect((await getTestDbClient().query('SELECT * FROM custom_metrics')).rows).toEqual([])
  expect((await getTestDbClient().query('SELECT * FROM time_series')).rows).toEqual([])
})
test('custom units reject without partial writes', async () => {
  await getTestDbClient().query("INSERT INTO custom_metrics(name,unit) VALUES('work_hires','kg')")
  await expect(saveWorkDay(getTestUser(), body())).rejects.toMatchObject({ status: 400 })
  expect((await getTestDbClient().query('SELECT * FROM time_series')).rows).toEqual([])
})
test('meaningful edits advance canonical entry ordering while retries preserve it', async () => {
  const db = getTestDbClient(),
    result = await saveWorkDay(getTestUser(), body())
  await db.query(
    "UPDATE activities SET data=jsonb_set(data,'{updated_at}','\"2026-01-01T00:00:00Z\"'::jsonb) WHERE id=$1",
    [result.activity_id],
  )
  await saveWorkDay(getTestUser(), body())
  expect(
    (await db.query('SELECT data FROM activities WHERE id=$1', [result.activity_id])).rows[0].data.updated_at,
  ).toBe('2026-01-01T00:00:00Z')
  await saveWorkDay(getTestUser(), body('Changed note'))
  const changed = (await db.query('SELECT data FROM activities WHERE id=$1', [result.activity_id])).rows[0]
    .data.updated_at
  expect(Date.parse(changed)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'))
  await saveWorkDay(getTestUser(), body('Changed note'))
  expect(
    (await db.query('SELECT data FROM activities WHERE id=$1', [result.activity_id])).rows[0].data.updated_at,
  ).toBe(changed)
})
