import * as spec from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
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
import * as tasks from './native-tasks.ts'

const page = { page: 1, per_page: 50 },
  taskQuery = { ...page, status: 'all' as const, search: '' }
describe('native private task persistence', () => {
  test('creates each board status and defaults legacy create requests to To do', async () => {
    const user = getTestUser()
    const normal = await tasks.createTaskItem(user, spec.createTaskItemBodySchema.parse({ title: 'Default' }))
    expect(normal).toMatchObject({ workflow_status: 'todo', done: false, completed_at: null })
    const progress = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Started', workflow_status: 'in_progress' }),
    )
    expect(progress).toMatchObject({ workflow_status: 'in_progress', done: false, completed_at: null })
    const done = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Finished', workflow_status: 'done' }),
    )
    expect(done).toMatchObject({ workflow_status: 'done', done: true })
    expect(done.completed_at).not.toBeNull()
  })
  test('reads legacy rows without migration and filters/counts/paginates the normalized columns', async () => {
    const user = getTestUser()
    const payloads = [
      { title: 'Legacy To do A', done: false },
      { title: 'Legacy To do B', done: false },
      { title: 'Legacy Done', done: true },
      { title: 'Started', done: false, workflow_status: 'in_progress' },
      { title: 'Completion wins', done: true, workflow_status: 'in_progress' },
      { title: 'Open wins', done: false, workflow_status: 'done' },
    ]
    for (const payload of payloads) {
      await getTestDbClient().query('INSERT INTO task_items (payload) VALUES ($1)', [
        JSON.stringify({ description: '', due_date: null, priority: 0, completed_at: null, ...payload }),
      ])
    }
    const todo = await tasks.listTaskItems(user, {
      ...taskQuery,
      workflow_status: 'todo',
      per_page: 1,
      page: 2,
    })
    expect(todo.total).toBe(3)
    expect(todo.data).toHaveLength(1)
    expect(todo.data[0]).toMatchObject({ title: 'Legacy To do B', done: false, workflow_status: 'todo' })
    const progress = await tasks.listTaskItems(user, { ...taskQuery, workflow_status: 'in_progress' })
    expect(progress.total).toBe(1)
    expect(progress.data[0].title).toBe('Started')
    const done = await tasks.listTaskItems(user, { ...taskQuery, workflow_status: 'done' })
    expect(done.total).toBe(2)
    expect(done.data.every((item) => item.done && item.workflow_status === 'done')).toBe(true)
    expect((await tasks.listTaskItems(user, { ...taskQuery, status: 'open' })).total).toBe(4)
    expect((await tasks.listTaskItems(user, { ...taskQuery, status: 'done' })).total).toBe(2)
    expect(
      (
        await tasks.listTaskItems(user, {
          ...taskQuery,
          workflow_status: 'todo',
          search: 'Legacy',
          project_id: 'inbox',
        })
      ).total,
    ).toBe(2)
    expect(
      (await tasks.listTaskItems(user, { ...taskQuery, workflow_status: 'done', status: 'open' })).total,
    ).toBe(0)
    const untouched = await getTestDbClient().query(
      "SELECT payload FROM task_items WHERE payload->>'title'='Legacy To do A'",
    )
    expect(untouched.rows[0].payload).not.toHaveProperty('workflow_status')
  })
  test('board moves and legacy checkboxes preserve completion timestamps and open progress', async () => {
    const user = getTestUser()
    let task = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Move me', due_date: '2026-12-01', priority: 2 }),
    )
    task = await tasks.updateTaskItem(user, task.id, {
      workflow_status: 'in_progress',
      expected_updated_at: task.updated_at,
    })
    expect(task).toMatchObject({
      workflow_status: 'in_progress',
      done: false,
      completed_at: null,
      due_date: '2026-12-01',
      priority: 2,
    })
    task = await tasks.updateTaskItem(user, task.id, {
      done: false,
      title: 'Still started',
      expected_updated_at: task.updated_at,
    })
    expect(task.workflow_status).toBe('in_progress')
    task = await tasks.updateTaskItem(user, task.id, {
      workflow_status: 'done',
      expected_updated_at: task.updated_at,
    })
    expect(task.done).toBe(true)
    const completed = task.completed_at
    expect(completed).not.toBeNull()
    task = await tasks.updateTaskItem(user, task.id, {
      workflow_status: 'done',
      expected_updated_at: task.updated_at,
    })
    expect(task.completed_at).toBe(completed)
    task = await tasks.updateTaskItem(user, task.id, { done: false, expected_updated_at: task.updated_at })
    expect(task).toMatchObject({ workflow_status: 'todo', done: false, completed_at: null })
    task = await tasks.updateTaskItem(user, task.id, {
      workflow_status: 'in_progress',
      expected_updated_at: task.updated_at,
    })
    task = await tasks.updateTaskItem(user, task.id, { done: true, expected_updated_at: task.updated_at })
    expect(task).toMatchObject({ workflow_status: 'done', done: true })
    task = await tasks.updateTaskItem(user, task.id, {
      workflow_status: 'in_progress',
      expected_updated_at: task.updated_at,
    })
    expect(task).toMatchObject({ workflow_status: 'in_progress', done: false, completed_at: null })
  })
  test('stale and contradictory moves never overwrite the current board status', async () => {
    const user = getTestUser(),
      task = await tasks.createTaskItem(user, spec.createTaskItemBodySchema.parse({ title: 'Move once' }))
    const moved = await tasks.updateTaskItem(user, task.id, {
      workflow_status: 'in_progress',
      expected_updated_at: task.updated_at,
    })
    await expect(
      tasks.updateTaskItem(user, task.id, { workflow_status: 'done', expected_updated_at: task.updated_at }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      tasks.updateTaskItem(user, task.id, {
        done: false,
        workflow_status: 'done',
        expected_updated_at: moved.updated_at,
      }),
    ).rejects.toThrow('must agree')
    expect((await tasks.listTaskItems(user, taskQuery)).data[0]).toMatchObject({
      workflow_status: 'in_progress',
      done: false,
      updated_at: moved.updated_at,
    })
  })

  beforeAll(startTestDb, 120000)
  afterAll(stopTestDb)
  beforeEach(async () => {
    await getTestDbClient().query('TRUNCATE task_items, task_projects, task_board_settings CASCADE')
  })
  test('task lifecycle preserves omitted values, checks stale edits, supports clear and protects projects', async () => {
    const user = getTestUser(),
      project = await tasks.createTaskProject(user, { title: 'Home' })
    const task = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({
        title: 'Buy filter',
        description: 'Size M',
        due_date: '2026-11-14',
        project_id: project.id,
        priority: 2,
      }),
    )
    await expect(tasks.deleteTaskProject(user, project.id, project.updated_at)).rejects.toMatchObject({
      status: 409,
    })
    const done = await tasks.updateTaskItem(user, task.id, {
      done: true,
      expected_updated_at: task.updated_at,
    })
    expect(done).toMatchObject({
      done: true,
      title: 'Buy filter',
      description: 'Size M',
      priority: 2,
      due_date: '2026-11-14',
    })
    expect(done.completed_at).not.toBeNull()
    await expect(
      tasks.updateTaskItem(user, task.id, { title: 'Stale', expected_updated_at: task.updated_at }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(tasks.deleteTaskItem(user, task.id, task.updated_at)).rejects.toMatchObject({ status: 409 })
    const reopened = await tasks.updateTaskItem(user, task.id, {
      done: false,
      due_date: null,
      project_id: null,
      expected_updated_at: done.updated_at,
    })
    expect(reopened).toMatchObject({ done: false, completed_at: null, due_date: null, project_id: null })
    expect(
      (await tasks.listTaskItems(user, { ...taskQuery, project_id: 'inbox', status: 'open' })).data,
    ).toHaveLength(1)
    expect((await tasks.listTaskItems(user, { ...taskQuery, status: 'done' })).data).toHaveLength(0)
    await tasks.deleteTaskProject(user, project.id, project.updated_at)
    await tasks.deleteTaskItem(user, task.id, reopened.updated_at)
    expect((await tasks.listTaskItems(user, taskQuery)).total).toBe(0)
  })
  test('project rename checks stale versions and empty project deletes do not affect other projects', async () => {
    const user = getTestUser(),
      original = await tasks.createTaskProject(user, { title: 'Original' }),
      other = await tasks.createTaskProject(user, { title: 'Keep' })
    const renamed = await tasks.updateTaskProject(user, original.id, {
      title: 'Renamed',
      expected_updated_at: original.updated_at,
    })
    expect(renamed.updated_at).not.toBe(original.updated_at)
    await expect(
      tasks.updateTaskProject(user, original.id, {
        title: 'Stale',
        expected_updated_at: original.updated_at,
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(tasks.deleteTaskProject(user, original.id, original.updated_at)).rejects.toMatchObject({
      status: 409,
    })
    await tasks.deleteTaskProject(user, original.id, renamed.updated_at)
    expect((await tasks.listTaskProjects(user, page)).data.map((p) => p.id)).toEqual([other.id])
  })
  test('two concurrent task edits cannot silently overwrite one another', async () => {
    const user = getTestUser(),
      task = await tasks.createTaskItem(user, spec.createTaskItemBodySchema.parse({ title: 'Original' }))
    const results = await Promise.allSettled(
      ['First', 'Second'].map((title) =>
        tasks.updateTaskItem(user, task.id, { title, expected_updated_at: task.updated_at }),
      ),
    )
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((x) => x.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason.status).toBe(409)
  })
  test('pagination/search/status/project filtering are deterministic and bounded', async () => {
    const user = getTestUser(),
      project = await tasks.createTaskProject(user, { title: 'Filtered' })
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await tasks.createTaskItem(user, spec.createTaskItemBodySchema.parse({ title }))
    }
    const inProject = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Project task', project_id: project.id }),
    )
    expect((await tasks.listTaskItems(user, { ...taskQuery, per_page: 1, page: 2 })).data[0].title).toBe(
      'Beta',
    )
    expect((await tasks.listTaskItems(user, { ...taskQuery, search: 'ga' })).data[0].title).toBe('Gamma')
    expect((await tasks.listTaskItems(user, { ...taskQuery, search: '%' })).data).toHaveLength(0)
    expect(
      (await tasks.listTaskItems(user, { ...taskQuery, project_id: project.id })).data.map((t) => t.id),
    ).toEqual([inProject.id])
    expect((await tasks.listTaskItems(user, { ...taskQuery, project_id: 'inbox' })).total).toBe(3)
  })
  test('due-date sorting preserves local dates and completed tasks follow open tasks', async () => {
    const user = getTestUser()
    const later = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Later', due_date: '2026-12-01' }),
    )
    const sooner = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Sooner', due_date: '2026-11-01' }),
    )
    expect((await tasks.listTaskItems(user, taskQuery)).data.map((t) => t.id)).toEqual([sooner.id, later.id])
    await tasks.updateTaskItem(user, sooner.id, { done: true, expected_updated_at: sooner.updated_at })
    expect((await tasks.listTaskItems(user, taskQuery)).data.map((t) => t.id)).toEqual([later.id, sooner.id])
  })
  test('missing and malformed project IDs cannot create dangling tasks', async () => {
    const user = getTestUser()
    await expect(
      tasks.createTaskItem(
        user,
        spec.createTaskItemBodySchema.parse({ title: 'Bad', project_id: randomUUID() }),
      ),
    ).rejects.toMatchObject({ status: 404 })
    await expect(tasks.deleteTaskItem(user, 'not-an-id', '2026-11-12T10:00:00Z')).rejects.toMatchObject({
      status: 400,
    })
    expect((await tasks.listTaskItems(user, taskQuery)).total).toBe(0)
  })
  test('per-user databases enforce project and task read/write ownership isolation', async () => {
    const user = getTestUser(),
      project = await tasks.createTaskProject(user, { title: 'Private' }),
      task = await tasks.createTaskItem(
        user,
        spec.createTaskItemBodySchema.parse({ title: 'Private task', project_id: project.id }),
      )
    const otherDb = await createTestDatabase(),
      pool = createRolePool({ connectionString: otherDb.uri, max: 2 }),
      other = 'other_native_tasks'
    _setDbForUser(other, pool)
    try {
      const otherBoard = await tasks.getTaskBoard(other)
      await tasks.updateTaskBoard(other, {
        columns: otherBoard.columns.map((c) => ({ ...c, title: 'Other ' + c.title })),
        expected_updated_at: otherBoard.updated_at,
      })
      expect((await tasks.getTaskBoard(user)).columns[0].title).toBe('To do')
      expect((await tasks.listTaskItems(other, taskQuery)).data).toEqual([])
      expect((await tasks.listTaskItems(other, { ...taskQuery, workflow_status: 'todo' })).total).toBe(0)
      await expect(
        tasks.updateTaskItem(other, task.id, {
          workflow_status: 'in_progress',
          expected_updated_at: task.updated_at,
        }),
      ).rejects.toMatchObject({ status: 404 })
      expect((await tasks.listTaskProjects(other, page)).data).toEqual([])
      await expect(
        tasks.createTaskItem(
          other,
          spec.createTaskItemBodySchema.parse({ title: 'Bad', project_id: project.id }),
        ),
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        tasks.updateTaskItem(other, task.id, { done: true, expected_updated_at: task.updated_at }),
      ).rejects.toMatchObject({ status: 404 })
      await expect(tasks.deleteTaskItem(other, task.id, task.updated_at)).rejects.toMatchObject({
        status: 404,
      })
      await expect(tasks.deleteTaskProject(other, project.id, project.updated_at)).rejects.toMatchObject({
        status: 404,
      })
      await expect(
        tasks.updateTaskProject(other, project.id, { title: 'Bad', expected_updated_at: project.updated_at }),
      ).rejects.toMatchObject({ status: 404 })
    } finally {
      await pool.end()
      await otherDb.drop()
    }
  }, 30000)

  test('custom board configuration rejects stale changes and protects used columns including legacy tasks', async () => {
    const user = getTestUser()
    const board = await tasks.getTaskBoard(user)
    expect(board.columns.map((c) => c.id)).toEqual(['todo', 'in_progress', 'done'])
    const columns = [
      ...board.columns,
      { id: 'review', title: 'Review', status: 'in_progress' as const, color: '#123456', wip_limit: 2 },
    ]
    const updated = await tasks.updateTaskBoard(user, { columns, expected_updated_at: board.updated_at })
    await expect(
      tasks.updateTaskBoard(user, { columns, expected_updated_at: board.updated_at }),
    ).rejects.toMatchObject({ status: 409 })
    const task = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Review', column_id: 'review' }),
    )
    expect(task).toMatchObject({
      column_id: 'review',
      workflow_status: 'in_progress',
      labels: [],
      archived: false,
    })
    await expect(
      tasks.updateTaskBoard(user, { columns: board.columns, expected_updated_at: updated.updated_at }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      tasks.updateTaskItem(user, task.id, {
        column_id: 'review',
        done: true,
        expected_updated_at: task.updated_at,
      }),
    ).rejects.toMatchObject({ status: 400 })
    const done = await tasks.updateTaskItem(user, task.id, {
      done: true,
      expected_updated_at: task.updated_at,
    })
    expect(done).toMatchObject({ column_id: 'done', done: true })
    await expect(
      tasks.updateTaskItem(user, task.id, { title: 'stale', expected_updated_at: task.updated_at }),
    ).rejects.toMatchObject({ status: 409 })
    await tasks.updateTaskBoard(user, { columns: board.columns, expected_updated_at: updated.updated_at })
    await expect(
      tasks.createTaskItem(
        user,
        spec.createTaskItemBodySchema.parse({
          title: 'Repeat',
          column_id: 'done',
          recurrence: 'daily',
          due_date: '2026-11-12',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })
  test('legacy columns survive reorder and used-column protection includes archived tasks', async () => {
    const user = getTestUser()
    const board = await tasks.getTaskBoard(user)
    const task = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Legacy', archived: true }),
    )
    await getTestDbClient().query("UPDATE task_items SET payload=payload - 'column_id' WHERE id=$1", [
      task.id,
    ])
    const replacement = {
      id: 'backlog',
      title: 'Backlog',
      status: 'todo' as const,
      color: '#123456',
      wip_limit: null,
    }
    await expect(
      tasks.updateTaskBoard(user, {
        columns: [replacement, ...board.columns.slice(1)],
        expected_updated_at: board.updated_at,
      }),
    ).rejects.toMatchObject({ status: 409 })
    const updated = await tasks.updateTaskBoard(user, {
      columns: [replacement, ...board.columns],
      expected_updated_at: board.updated_at,
    })
    expect(
      (await tasks.listTaskItems(user, { ...taskQuery, column_id: 'todo', archived: 'only' })).total,
    ).toBe(1)
    const concurrent = await Promise.allSettled([
      tasks.updateTaskBoard(user, { columns: updated.columns, expected_updated_at: updated.updated_at }),
      tasks.updateTaskBoard(user, { columns: updated.columns, expected_updated_at: updated.updated_at }),
    ])
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    })
  })
  test('filters before pagination, orders manually, and resets recurring metadata', async () => {
    const user = getTestUser()
    const first = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({
        title: 'Alpha',
        description: 'searchable description',
        labels: ['urgent'],
        checklist: [{ id: 'a', title: 'Check', done: true }],
        custom_fields: [{ name: 'Owner', value: 'Me' }],
        blocked_reason: 'Waiting',
        priority: 3,
        position: 10,
        due_date: '2026-11-12',
        recurrence: 'daily',
      }),
    )
    await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Beta', labels: ['urgent'], position: -10 }),
    )
    await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'Archive', archived: true }),
    )
    expect(
      (await tasks.listTaskItems(user, { ...taskQuery, search: 'urgent', sort: 'manual', per_page: 1 }))
        .data[0].title,
    ).toBe('Beta')
    expect((await tasks.listTaskItems(user, { ...taskQuery, search: 'searchable' })).total).toBe(1)
    expect(
      (
        await tasks.listTaskItems(user, {
          ...taskQuery,
          label: 'urgent',
          blocked: true,
          priority: 3,
          due_after: '2026-11-11',
          due_before: '2026-11-13',
          column_id: 'todo',
        })
      ).total,
    ).toBe(1)
    expect((await tasks.listTaskItems(user, { ...taskQuery, archived: 'only' })).total).toBe(1)
    expect((await tasks.listTaskItems(user, { ...taskQuery, archived: 'include' })).total).toBe(3)
    const completed = await tasks.updateTaskItem(user, first.id, {
      done: true,
      archived: true,
      expected_updated_at: first.updated_at,
    })
    const next = (await tasks.listTaskItems(user, { ...taskQuery })).data.find(
      (t) => t.id === completed.next_occurrence_id,
    )
    expect(next).toMatchObject({
      column_id: 'todo',
      archived: false,
      position: 0,
      blocked_reason: '',
      labels: ['urgent'],
      checklist: [{ id: 'a', title: 'Check', done: false }],
      custom_fields: [{ name: 'Owner', value: 'Me' }],
    })
  })
  test('active schema does not create any paused Kitchen tables', async () => {
    const result = await getTestDbClient().query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'kitchen_%'",
    )
    expect(result.rows).toEqual([])
  })
})
