import * as spec from '@aurboda/api-spec'
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

const query = { page: 1, per_page: 100, status: 'all' as const, search: '' }
const repeatInput = (overrides: Partial<spec.CreateTaskItemBody> = {}) =>
  spec.createTaskItemBodySchema.parse({
    title: 'Water plants',
    description: 'Check the soil first',
    priority: 2,
    due_date: '2026-11-12',
    recurrence: 'daily',
    ...overrides,
  })
const getTask = async (user: string, id: string) =>
  (await tasks.listTaskItems(user, query)).data.find((task) => task.id === id)!

describe('native recurring task persistence', () => {
  beforeAll(startTestDb, 120000)
  afterAll(stopTestDb)
  beforeEach(async () => {
    await getTestDbClient().query('TRUNCATE task_items, task_projects CASCADE')
  })

  test('legacy tasks normalize new fields to null without modifying their data', async () => {
    const user = getTestUser(),
      task = await tasks.createTaskItem(user, spec.createTaskItemBodySchema.parse({ title: 'Legacy' }))
    await getTestDbClient().query(
      "UPDATE task_items SET payload=payload - 'recurrence' - 'next_occurrence_id' - 'recurrence_anchor_day' WHERE id=$1",
      [task.id],
    )
    expect(await getTask(user, task.id)).toMatchObject({ recurrence: null, next_occurrence_id: null })
    const raw = (await getTestDbClient().query('SELECT payload FROM task_items WHERE id=$1', [task.id]))
      .rows[0].payload
    expect(raw).not.toHaveProperty('recurrence')
  })

  test('completion creates one copied To do successor and retains completed history', async () => {
    const user = getTestUser(),
      project = await tasks.createTaskProject(user, { title: 'Home' }),
      original = await tasks.createTaskItem(user, repeatInput({ project_id: project.id }))
    const completed = await tasks.updateTaskItem(user, original.id, {
      done: true,
      expected_updated_at: original.updated_at,
    })
    expect(completed).toMatchObject({ done: true, workflow_status: 'done', recurrence: 'daily' })
    expect(completed.next_occurrence_id).not.toBeNull()
    expect(completed.completed_at).not.toBeNull()
    const next = await getTask(user, completed.next_occurrence_id!)
    expect(next).toMatchObject({
      title: original.title,
      description: original.description,
      project_id: project.id,
      priority: 2,
      due_date: '2026-11-13',
      recurrence: 'daily',
      workflow_status: 'todo',
      done: false,
      completed_at: null,
      next_occurrence_id: null,
    })
    expect(next).not.toHaveProperty('recurrence_anchor_day')
    expect((await tasks.listTaskItems(user, query)).total).toBe(2)
  })

  test.each([
    { done: true },
    { workflow_status: 'done' as const },
    { done: true, workflow_status: 'done' as const },
  ])('all completion paths generate one successor: %j', async (patch) => {
    const user = getTestUser(),
      original = await tasks.createTaskItem(user, repeatInput({ recurrence: 'weekly' }))
    const completed = await tasks.updateTaskItem(user, original.id, {
      ...patch,
      expected_updated_at: original.updated_at,
    })
    expect((await getTask(user, completed.next_occurrence_id!)).due_date).toBe('2026-11-19')
    expect((await tasks.listTaskItems(user, query)).total).toBe(2)
  })

  test('concurrent completions, repeated Done saves, reopen and recomplete never duplicate successors', async () => {
    const user = getTestUser(),
      original = await tasks.createTaskItem(user, repeatInput())
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        tasks.updateTaskItem(user, original.id, { done: true, expected_updated_at: original.updated_at }),
      ),
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find((result) => result.status === 'rejected')
    expect(failure?.status === 'rejected' && failure.reason.status).toBe(409)
    let completed = await getTask(user, original.id)
    const nextId = completed.next_occurrence_id,
      finishedAt = completed.completed_at
    completed = await tasks.updateTaskItem(user, original.id, {
      workflow_status: 'done',
      expected_updated_at: completed.updated_at,
    })
    expect(completed.completed_at).toBe(finishedAt)
    const reopened = await tasks.updateTaskItem(user, original.id, {
      done: false,
      expected_updated_at: completed.updated_at,
    })
    completed = await tasks.updateTaskItem(user, original.id, {
      done: true,
      expected_updated_at: reopened.updated_at,
    })
    expect(completed.next_occurrence_id).toBe(nextId)
    expect((await tasks.listTaskItems(user, query)).total).toBe(2)
    const next = await getTask(user, nextId!)
    await tasks.deleteTaskItem(user, next.id, next.updated_at)
    const reopenedAgain = await tasks.updateTaskItem(user, original.id, {
      done: false,
      expected_updated_at: completed.updated_at,
    })
    const again = await tasks.updateTaskItem(user, original.id, {
      done: true,
      expected_updated_at: reopenedAgain.updated_at,
    })
    expect(again.next_occurrence_id).toBe(nextId)
    expect((await tasks.listTaskItems(user, query)).total).toBe(1)
  })

  test('concurrent completion and editor save do not invert parent and task locks', async () => {
    const user = getTestUser(),
      project = await tasks.createTaskProject(user, { title: 'Lock order' })
    const task = await tasks.createTaskItem(user, repeatInput({ project_id: project.id }))
    const client = getTestDbClient()
    const waitForBlockedTasks = async (count: number) => {
      const deadline = Date.now() + 3000
      while (Date.now() < deadline) {
        // This fixture holds a transaction; refresh PostgreSQL's transaction-cached
        // statistics snapshot so the second waiter becomes observable.
        await client.query('SELECT pg_stat_clear_snapshot()')
        const blocked = await client.query(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND (query LIKE 'SELECT * FROM task_items WHERE id=%' OR query LIKE 'SELECT * FROM task_board_settings WHERE id=%')",
        )
        if (Number(blocked.rows[0].count) >= count) return
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      throw new Error('Expected task operations to wait for the fixture row lock')
    }
    await client.query('BEGIN')
    await client.query('SELECT id FROM task_items WHERE id=$1 FOR UPDATE', [task.id])
    const completion = tasks.updateTaskItem(user, task.id, {
      done: true,
      expected_updated_at: task.updated_at,
    })
    let editor: ReturnType<typeof tasks.updateTaskItem> | undefined
    // Attach handlers immediately so a deliberately failed concurrent request is not unhandled.
    const completionResult = completion.then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    )
    let editorResult: typeof completionResult | undefined
    try {
      await waitForBlockedTasks(1)
      editor = tasks.updateTaskItem(user, task.id, {
        project_id: project.id,
        title: 'Editor save',
        expected_updated_at: task.updated_at,
      })
      editorResult = editor.then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      )
      await waitForBlockedTasks(2)
    } finally {
      await client.query('COMMIT')
    }
    const results = await Promise.all([completionResult, editorResult!])
    expect(results[0].ok).toBe(true)
    expect(results[1]).toMatchObject({ ok: false, error: { status: 409 } })
    expect((await tasks.listTaskItems(user, query)).total).toBe(2)
  }, 10000)

  test('monthly chain preserves Jan31 anchor through same-field saves and February clamp', async () => {
    const user = getTestUser(),
      january = await tasks.createTaskItem(
        user,
        repeatInput({ recurrence: 'monthly', due_date: '2026-01-31' }),
      )
    const januaryDone = await tasks.updateTaskItem(user, january.id, {
      done: true,
      expected_updated_at: january.updated_at,
    })
    let february = await getTask(user, januaryDone.next_occurrence_id!)
    expect(february.due_date).toBe('2026-02-28')
    february = await tasks.updateTaskItem(user, february.id, {
      title: 'Same schedule',
      recurrence: 'monthly',
      due_date: '2026-02-28',
      expected_updated_at: february.updated_at,
    })
    const februaryDone = await tasks.updateTaskItem(user, february.id, {
      workflow_status: 'done',
      expected_updated_at: february.updated_at,
    })
    expect((await getTask(user, februaryDone.next_occurrence_id!)).due_date).toBe('2026-03-31')
    expect(februaryDone.next_occurrence_id).not.toBe(januaryDone.next_occurrence_id)
  })

  test('actual due date and recurrence edits reset monthly anchors', async () => {
    const user = getTestUser(),
      january = await tasks.createTaskItem(
        user,
        repeatInput({ recurrence: 'monthly', due_date: '2028-01-31' }),
      )
    const januaryDone = await tasks.updateTaskItem(user, january.id, {
      done: true,
      expected_updated_at: january.updated_at,
    })
    let february = await getTask(user, januaryDone.next_occurrence_id!)
    expect(february.due_date).toBe('2028-02-29')
    february = await tasks.updateTaskItem(user, february.id, {
      due_date: '2028-02-27',
      expected_updated_at: february.updated_at,
    })
    const februaryDone = await tasks.updateTaskItem(user, february.id, {
      done: true,
      expected_updated_at: february.updated_at,
    })
    let march = await getTask(user, februaryDone.next_occurrence_id!)
    expect(march.due_date).toBe('2028-03-27')
    march = await tasks.updateTaskItem(user, march.id, {
      recurrence: 'daily',
      expected_updated_at: march.updated_at,
    })
    march = await tasks.updateTaskItem(user, march.id, {
      recurrence: 'monthly',
      expected_updated_at: march.updated_at,
    })
    const marchDone = await tasks.updateTaskItem(user, march.id, {
      done: true,
      expected_updated_at: march.updated_at,
    })
    expect((await getTask(user, marchDone.next_occurrence_id!)).due_date).toBe('2028-04-27')
  })

  test('validates merged due-date requirements and allows explicitly stopping recurrence', async () => {
    const user = getTestUser(),
      original = await tasks.createTaskItem(user, repeatInput())
    await expect(
      tasks.updateTaskItem(user, original.id, { due_date: null, expected_updated_at: original.updated_at }),
    ).rejects.toMatchObject({ status: 400 })
    expect((await getTask(user, original.id)).updated_at).toBe(original.updated_at)
    const stopped = await tasks.updateTaskItem(user, original.id, {
      recurrence: null,
      due_date: null,
      expected_updated_at: original.updated_at,
    })
    expect(stopped).toMatchObject({ recurrence: null, due_date: null })
    const completed = await tasks.updateTaskItem(user, stopped.id, {
      done: true,
      expected_updated_at: stopped.updated_at,
    })
    expect(completed.next_occurrence_id).toBeNull()
    const noDate = await tasks.createTaskItem(
      user,
      spec.createTaskItemBodySchema.parse({ title: 'No due date' }),
    )
    await expect(
      tasks.updateTaskItem(user, noDate.id, { recurrence: 'daily', expected_updated_at: noDate.updated_at }),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('completion uses final merged project/title and late dates remain on schedule', async () => {
    const user = getTestUser(),
      project = await tasks.createTaskProject(user, { title: 'Original' }),
      original = await tasks.createTaskItem(
        user,
        repeatInput({ project_id: project.id, due_date: '2020-01-01' }),
      )
    const completed = await tasks.updateTaskItem(user, original.id, {
      project_id: null,
      title: 'Updated title',
      description: 'Updated details',
      priority: 3,
      done: true,
      expected_updated_at: original.updated_at,
    })
    const next = await getTask(user, completed.next_occurrence_id!)
    expect(next).toMatchObject({
      project_id: null,
      title: 'Updated title',
      description: 'Updated details',
      priority: 3,
      due_date: '2020-01-02',
    })
    const edited = await tasks.updateTaskItem(user, completed.id, {
      due_date: '2026-11-12',
      recurrence: 'monthly',
      title: 'Historical edit',
      expected_updated_at: completed.updated_at,
    })
    expect(edited.next_occurrence_id).toBe(next.id)
    expect(await getTask(user, next.id)).toEqual(next)
  })

  test('adding a schedule to an already-completed task does not generate retroactively', async () => {
    const user = getTestUser(),
      completed = await tasks.createTaskItem(
        user,
        spec.createTaskItemBodySchema.parse({
          title: 'Already done',
          workflow_status: 'done',
          due_date: '2026-11-12',
        }),
      )
    const edited = await tasks.updateTaskItem(user, completed.id, {
      recurrence: 'daily',
      expected_updated_at: completed.updated_at,
    })
    expect(edited.next_occurrence_id).toBeNull()
    expect((await tasks.listTaskItems(user, query)).total).toBe(1)
  })

  test('calendar overflow fails gracefully without completing the task or creating a child', async () => {
    const user = getTestUser(),
      original = await tasks.createTaskItem(user, repeatInput({ due_date: '9999-12-31' }))
    await expect(
      tasks.updateTaskItem(user, original.id, { done: true, expected_updated_at: original.updated_at }),
    ).rejects.toMatchObject({ status: 400 })
    expect(await getTask(user, original.id)).toEqual(original)
    expect((await tasks.listTaskItems(user, query)).total).toBe(1)
  })

  test('failure after successor insertion rolls back both source completion and successor', async () => {
    const user = getTestUser(),
      original = await tasks.createTaskItem(user, repeatInput())
    await getTestDbClient().query(
      `CREATE FUNCTION reject_test_task_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE TRIGGER reject_test_task_update BEFORE UPDATE ON task_items FOR EACH ROW EXECUTE FUNCTION reject_test_task_update()`,
    )
    try {
      await expect(
        tasks.updateTaskItem(user, original.id, { done: true, expected_updated_at: original.updated_at }),
      ).rejects.toThrow('fixture failure')
      expect(await getTask(user, original.id)).toEqual(original)
      expect((await tasks.listTaskItems(user, query)).total).toBe(1)
    } finally {
      await getTestDbClient().query(
        'DROP TRIGGER reject_test_task_update ON task_items; DROP FUNCTION reject_test_task_update()',
      )
    }
  })

  test('foreign accounts cannot complete a recurring task or see its successor', async () => {
    const user = getTestUser(),
      original = await tasks.createTaskItem(user, repeatInput()),
      otherDb = await createTestDatabase(),
      pool = createRolePool({ connectionString: otherDb.uri, max: 2 }),
      other = 'other_recurring_tasks'
    _setDbForUser(other, pool)
    try {
      await expect(
        tasks.updateTaskItem(other, original.id, { done: true, expected_updated_at: original.updated_at }),
      ).rejects.toMatchObject({ status: 404 })
      const completed = await tasks.updateTaskItem(user, original.id, {
        done: true,
        expected_updated_at: original.updated_at,
      })
      expect(completed.next_occurrence_id).not.toBeNull()
      expect((await tasks.listTaskItems(other, query)).total).toBe(0)
    } finally {
      await pool.end()
      await otherDb.drop()
    }
  }, 30000)
})
