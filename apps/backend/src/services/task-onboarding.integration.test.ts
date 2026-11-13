import { createTaskItemBodySchema, type TaskBoardColumn, type TaskItem } from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, describe, expect, inject, test } from 'vitest'

import {
  _setDbForUser,
  initializeSchema,
  migrateSchema,
  schemaUpToDate,
  userDbName,
} from '../db/connection.ts'
import { createRolePool, type UserDb } from '../db/pool.ts'
import { schemaFingerprint } from '../schema.ts'
import * as tasks from './native-tasks.ts'
import { defaultTaskColumns } from './task-board-defaults.ts'
import { onboardingCatalog } from './task-onboarding-catalog.ts'
import { seedTaskOnboarding } from './task-onboarding.ts'

const accounts: { db: UserDb; database: string; user: string }[] = []
const adminUri = () => {
  const uri = inject('pgAdminUri')
  if (!uri) throw new Error('Integration database is not available')
  return uri
}
const admin = async <T>(fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: adminUri() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}
const account = async (empty = false) => {
  const user = `onboarding_${randomUUID().replaceAll('-', '')}`
  const database = userDbName(user)
  await admin((client) =>
    client.query(`CREATE DATABASE "${database}"${empty ? '' : ` TEMPLATE "${inject('pgTemplateDb')}"`}`),
  )
  const uri = new URL(adminUri())
  uri.pathname = `/${database}`
  const db = createRolePool({ connectionString: uri.toString(), max: 5 })
  if (empty) {
    for (const extension of ['postgis', 'pg_trgm', 'unaccent']) {
      await db.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`)
    }
  }
  _setDbForUser(user, db)
  const result = { db, database, user }
  accounts.push(result)
  return result
}
const query = { page: 1, per_page: 100, status: 'all' as const, search: '', sort: 'manual' as const }
const marker = async (db: UserDb) => (await db.query('SELECT * FROM task_onboarding_seed')).rows[0]
const saved = async (db: UserDb) => ({
  board: (await db.query('SELECT * FROM task_board_settings')).rows,
  tasks: (await db.query('SELECT * FROM task_items ORDER BY id')).rows,
  seed: (await db.query('SELECT * FROM task_onboarding_seed')).rows,
})

const assessmentFixture = async (
  db: UserDb,
  key: string,
  value?: unknown,
  deleted = false,
  questionKey: string = randomUUID(),
) => {
  await db.query(
    `INSERT INTO questionnaire_templates(stable_key,display_name,moment) VALUES ($1,'Synthetic assessment','custom')
     ON CONFLICT (stable_key) DO NOTHING`,
    [key],
  )
  const template = (await db.query('SELECT id FROM questionnaire_templates WHERE stable_key=$1', [key]))
    .rows[0].id
  const question = (
    await db.query(
      `INSERT INTO assessment_questions(template_id,stable_key,prompt,response_type) VALUES ($1,$2,'Synthetic question','numeric') RETURNING id`,
      [template, questionKey],
    )
  ).rows[0].id
  const assessment = (
    await db.query(
      `INSERT INTO assessments(template_id,template_version,assessed_at,timezone,deleted_at)
     VALUES ($1,1,NOW(),'UTC',$2) RETURNING id`,
      [template, deleted ? new Date() : null],
    )
  ).rows[0].id
  if (value !== undefined) {
    await db.query(
      'INSERT INTO assessment_responses(assessment_id,question_id,question_version,value) VALUES ($1,$2,1,$3)',
      [assessment, question, JSON.stringify(value)],
    )
  }
}

afterAll(async () => {
  await Promise.all(accounts.map(({ db }) => db.end()))
  await admin(async (client) => {
    for (const { database } of accounts) await client.query(`DROP DATABASE "${database}" WITH (FORCE)`)
  })
}, 60_000)

describe('optional Kanban onboarding persistence', () => {
  test('new-account initialization seeds normal tasks once before recording the schema fingerprint', async () => {
    const { db, user } = await account(true)
    await initializeSchema(user)
    const seed = await marker(db)
    expect(seed.catalog_key).toBe('optional-kanban-onboarding')
    expect(await schemaUpToDate(db, schemaFingerprint())).toBe(true)
    const board = await tasks.getTaskBoard(user)
    expect(board.columns.slice(0, 3)).toEqual(defaultTaskColumns)
    expect(board.columns[3]).toMatchObject({ id: seed.column_id, title: 'Onboarding', status: 'todo' })
    const catalog = onboardingCatalog(defaultTaskColumns)
    const items = (await tasks.listTaskItems(user, query)).data
    expect(items.map(({ title, description }) => ({ title, description }))).toEqual(
      catalog.map(({ title, description }) => ({ title, description })),
    )
    for (const item of items) {
      expect(item).toMatchObject({
        column_id: seed.column_id,
        project_id: null,
        workflow_status: 'todo',
        due_date: null,
        recurrence: null,
        next_occurrence_id: null,
        priority: 0,
        done: false,
        archived: false,
        completed_at: null,
        blocked_reason: '',
        labels: [],
        checklist: [],
        custom_fields: [],
      })
      expect(item.description.length).toBeGreaterThan(0)
    }
    const before = await saved(db)
    await initializeSchema(user)
    expect(await migrateSchema(user)).toBe(false)
    await seedTaskOnboarding(db)
    expect(await saved(db)).toEqual(before)
  }, 60_000)

  test('migration creates one account board even when Tasks is hidden and projects already exist', async () => {
    const { db, user } = await account()
    const settings = { hidden_pages: ['/goals', '/assessments'], timezone: 'America/Denver' }
    await db.query('INSERT INTO user_settings (settings) VALUES ($1)', [JSON.stringify(settings)])
    const project = await tasks.createTaskProject(user, { title: 'Existing project' })
    await db.query('INSERT INTO task_items (project_id, payload) VALUES ($1,$2)', [
      project.id,
      JSON.stringify({
        title: 'Legacy project task',
        description: 'Keep me',
        due_date: null,
        priority: 2,
        done: false,
        completed_at: null,
      }),
    ])
    const legacy = (await db.query('SELECT * FROM task_items')).rows[0]
    expect(await migrateSchema(user)).toBe(true)
    expect((await db.query('SELECT settings FROM user_settings')).rows[0].settings).toEqual(settings)
    expect((await db.query('SELECT * FROM task_items WHERE id=$1', [legacy.id])).rows[0]).toEqual(legacy)
    expect((await tasks.getTaskBoard(user)).columns.slice(0, 3)).toEqual(defaultTaskColumns)
    const seed = await marker(db)
    expect(
      (await tasks.listTaskItems(user, { ...query, project_id: project.id })).data.map((item) => item.id),
    ).toEqual([legacy.id])
    const inbox = await tasks.listTaskItems(user, { ...query, project_id: 'inbox' })
    expect(inbox.data.every((item) => item.column_id === seed.column_id)).toBe(true)
    expect(inbox.total).toBe(onboardingCatalog(defaultTaskColumns).length)
    await tasks.createTaskProject(user, { title: 'Another project' })
    await migrateSchema(user, { force: true })
    expect((await db.query('SELECT count(*)::int AS n FROM task_board_settings')).rows[0].n).toBe(1)
    expect((await db.query('SELECT count(*)::int AS n FROM task_onboarding_seed')).rows[0].n).toBe(1)
  }, 60_000)

  test('full twenty-column custom boards retain order, titles, legacy assignments and same-name user columns', async () => {
    const { db, user } = await account()
    const columns: TaskBoardColumn[] = [
      ...defaultTaskColumns.map((column, index) => ({
        ...column,
        title: ['Ready queue', 'Doing things', 'Finished work'][index],
      })),
      ...Array.from(
        { length: 17 },
        (_, i): TaskBoardColumn => ({
          id: `custom-${i}`,
          title: i === 0 ? 'Onboarding' : `Custom ${i}`,
          status: 'todo',
          color: '#123456',
          wip_limit: 2,
        }),
      ),
    ]
    await db.query('INSERT INTO task_board_settings (id, columns) VALUES (1,$1)', [JSON.stringify(columns)])
    await db.query('INSERT INTO task_items (payload) VALUES ($1)', [
      JSON.stringify({ title: 'Original', done: false }),
    ])
    const original = (await db.query('SELECT * FROM task_items')).rows[0]
    await migrateSchema(user)
    const board = await tasks.getTaskBoard(user)
    expect(board.columns).toHaveLength(21)
    expect(board.columns.slice(0, 20)).toEqual(columns)
    const seed = await marker(db)
    expect(seed.column_id).not.toBe('custom-0')
    expect(board.columns[20].id).toBe(seed.column_id)
    expect((await db.query('SELECT * FROM task_items WHERE id=$1', [original.id])).rows[0]).toEqual(original)
    const seeded = (await tasks.listTaskItems(user, { ...query, column_id: seed.column_id })).data
    expect(seeded.map(({ title, description }) => ({ title, description }))).toEqual(
      onboardingCatalog(columns).map(({ title, description }) => ({ title, description })),
    )
    await expect(
      tasks.updateTaskBoard(user, { columns: board.columns, expected_updated_at: board.updated_at }),
    ).resolves.toMatchObject({ columns: board.columns })
  }, 60_000)

  test('concurrent seeders and repeated migrations insert only one column and one catalog', async () => {
    const { db, user } = await account()
    await Promise.all(Array.from({ length: 8 }, () => seedTaskOnboarding(db)))
    const before = await saved(db)
    expect(before.board[0].columns).toHaveLength(4)
    expect(before.tasks).toHaveLength(onboardingCatalog(defaultTaskColumns).length)
    expect(before.seed).toHaveLength(1)
    await migrateSchema(user, { force: true })
    await seedTaskOnboarding(db)
    expect(await saved(db)).toEqual(before)
  }, 60_000)

  test('a failure after an insert rolls back every seeded task, board change and marker and migration can retry', async () => {
    const { db, user } = await account()
    const existing = await tasks.createTaskItem(
      user,
      createTaskItemBodySchema.parse({ title: 'Existing task' }),
    )
    const before = await saved(db)
    await db.query(`CREATE FUNCTION fail_second_onboarding_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (SELECT count(*) FROM task_items) > 1 THEN RAISE EXCEPTION 'synthetic seed failure'; END IF;
        RETURN NEW;
      END $$`)
    await db.query(
      'CREATE TRIGGER fail_onboarding BEFORE INSERT ON task_items FOR EACH ROW EXECUTE FUNCTION fail_second_onboarding_insert()',
    )
    await expect(migrateSchema(user)).rejects.toThrow('synthetic seed failure')
    expect(await saved(db)).toEqual(before)
    expect(await schemaUpToDate(db, schemaFingerprint())).toBe(false)
    await db.query('DROP TRIGGER fail_onboarding ON task_items')
    await migrateSchema(user)
    expect(await schemaUpToDate(db, schemaFingerprint())).toBe(true)
    expect((await tasks.listTaskItems(user, { ...query, search: 'Existing task' })).data[0].id).toBe(
      existing.id,
    )
    expect((await saved(db)).tasks).toHaveLength(onboardingCatalog(defaultTaskColumns).length + 1)
  }, 60_000)

  test('seeded cards support ordinary editing, moves, completion, project assignment and deletion', async () => {
    const { db, user } = await account()
    await seedTaskOnboarding(db)
    let item: TaskItem = (await tasks.listTaskItems(user, query)).data[0]
    const project = await tasks.createTaskProject(user, { title: 'Mine now' })
    item = await tasks.updateTaskItem(user, item.id, {
      expected_updated_at: item.updated_at,
      title: 'My own task',
      description: 'My own description',
      project_id: project.id,
    })
    item = await tasks.updateTaskItem(user, item.id, {
      expected_updated_at: item.updated_at,
      column_id: 'in_progress',
    })
    expect(item).toMatchObject({
      title: 'My own task',
      description: 'My own description',
      workflow_status: 'in_progress',
      project_id: project.id,
    })
    item = await tasks.updateTaskItem(user, item.id, { expected_updated_at: item.updated_at, done: true })
    expect(item.done).toBe(true)
    expect(item.completed_at).not.toBeNull()
    await tasks.deleteTaskItem(user, item.id, item.updated_at)
    await seedTaskOnboarding(db)
    expect((await db.query('SELECT 1 FROM task_items WHERE id=$1', [item.id])).rowCount).toBe(0)
  })

  test('deleting all onboarding cards and their column survives a restart, forced migration and catalog changes', async () => {
    const { db, user, database } = await account()
    await seedTaskOnboarding(db)
    const seed = await marker(db)
    for (const item of (await tasks.listTaskItems(user, query)).data) {
      await tasks.deleteTaskItem(user, item.id, item.updated_at)
    }
    const board = await tasks.getTaskBoard(user)
    await tasks.updateTaskBoard(user, {
      expected_updated_at: board.updated_at,
      columns: board.columns.filter((column) => column.id !== seed.column_id),
    })
    // A past catalog identity must remain authoritative after a later catalog revision.
    await db.query("UPDATE task_onboarding_seed SET catalog_key='previous-catalog-revision'")
    const before = await saved(db)
    const uri = new URL(adminUri())
    uri.pathname = `/${database}`
    const restarted = createRolePool({ connectionString: uri.toString(), max: 2 })
    try {
      _setDbForUser(user, restarted)
      await migrateSchema(user, { force: true })
      await initializeSchema(user)
      await seedTaskOnboarding(restarted)
      expect(await saved(restarted)).toEqual(before)
      expect((await tasks.getTaskBoard(user)).columns).toEqual(defaultTaskColumns)
    } finally {
      _setDbForUser(user, db)
      await restarted.end()
    }
  }, 60_000)

  test('existing completed assessments remain unchanged and every card is available for manual completion or deletion', async () => {
    const { db, user } = await account()
    await assessmentFixture(db, 'mental_pss14_v1', 20, false, 'pss14_total')
    const before = await db.query('SELECT * FROM assessments ORDER BY id')
    const responses = await db.query('SELECT * FROM assessment_responses ORDER BY id')
    await migrateSchema(user)
    const titles = (await tasks.listTaskItems(user, query)).data.map((item) => item.title)
    expect(titles).toEqual(onboardingCatalog(defaultTaskColumns).map((card) => card.title))
    expect((await db.query('SELECT * FROM assessments ORDER BY id')).rows).toEqual(before.rows)
    expect((await db.query('SELECT * FROM assessment_responses ORDER BY id')).rows).toEqual(responses.rows)
  }, 60_000)

  test('accounts own separate mutable task records and cannot edit another account’s seed', async () => {
    const first = await account()
    const second = await account()
    await Promise.all([seedTaskOnboarding(first.db), seedTaskOnboarding(second.db)])
    const beforeSecond = await saved(second.db)
    const item = (await tasks.listTaskItems(first.user, query)).data[0]
    expect((await marker(first.db)).column_id).not.toBe((await marker(second.db)).column_id)
    await expect(
      tasks.updateTaskItem(second.user, item.id, {
        expected_updated_at: item.updated_at,
        title: 'Cross-account edit',
      }),
    ).rejects.toMatchObject({ status: 404 })
    await tasks.updateTaskItem(first.user, item.id, {
      expected_updated_at: item.updated_at,
      description: 'First account private edit',
    })
    expect(await saved(second.db)).toEqual(beforeSecond)
    expect((await tasks.listTaskItems(second.user, query)).data.some((other) => other.id === item.id)).toBe(
      false,
    )
  })

  test('the deployment migration seeds an inactive account without touching visibility preferences', async () => {
    const { db, user } = await account()
    await db.query('INSERT INTO user_settings(settings) VALUES ($1)', [
      JSON.stringify({ hidden_pages: ['/goals'] }),
    ])
    await migrateSchema(user)
    expect(await marker(db)).toBeDefined()
    expect((await db.query('SELECT settings FROM user_settings')).rows[0].settings).toEqual({
      hidden_pages: ['/goals'],
    })
    expect((await tasks.getTaskBoard(user)).columns).toHaveLength(4)
  }, 60_000)
})
