import * as spec from '@aurboda/api-spec'
import { describe, expect, test } from 'vitest'

import { nativeTaskPaths } from '../../../../packages/api-spec/src/native-tasks-paths.ts'
import { isToolAllowedWhenReadOnly } from '../mcp/read-only-gate.ts'
import { nativeTaskTables } from '../schema/native-tasks.ts'
import { taskWorkflowStatus } from './native-tasks-store.ts'

describe('private task contracts', () => {
  test('normalizes legacy completion and stored in-progress status consistently', () => {
    expect(taskWorkflowStatus({ done: true })).toBe('done')
    expect(taskWorkflowStatus({ done: false })).toBe('todo')
    expect(taskWorkflowStatus({ done: false, workflow_status: 'in_progress' })).toBe('in_progress')
    expect(taskWorkflowStatus({ done: true, workflow_status: 'in_progress' })).toBe('done')
    expect(taskWorkflowStatus({ done: false, workflow_status: 'done' })).toBe('todo')
  })
  test('workflow creation is optional and never inserts a patch default', () => {
    expect(spec.createTaskItemBodySchema.parse({ title: 'Legacy create' })).not.toHaveProperty(
      'workflow_status',
    )
    expect(
      spec.createTaskItemBodySchema.parse({ title: 'Started', workflow_status: 'in_progress' })
        .workflow_status,
    ).toBe('in_progress')
    expect(
      spec.updateTaskItemBodySchema.parse({ title: 'Edit', expected_updated_at: '2026-11-12T10:00:00Z' }),
    ).not.toHaveProperty('workflow_status')
  })
  test.each([
    { done: true, workflow_status: 'todo' },
    { done: true, workflow_status: 'in_progress' },
    { done: false, workflow_status: 'done' },
  ])('rejects contradictory completion and column inputs %j', (body) => {
    expect(
      spec.updateTaskItemBodySchema.safeParse({ ...body, expected_updated_at: '2026-11-12T10:00:00Z' })
        .success,
    ).toBe(false)
  })
  test('accepts compatible completion and column inputs and validates board filters', () => {
    for (const body of [
      { done: true, workflow_status: 'done' },
      { done: false, workflow_status: 'in_progress' },
      { done: false, workflow_status: 'todo' },
    ]) {
      expect(
        spec.updateTaskItemBodySchema.safeParse({ ...body, expected_updated_at: '2026-11-12T10:00:00Z' })
          .success,
      ).toBe(true)
    }
    expect(spec.taskItemsQuerySchema.parse({ workflow_status: 'todo' }).workflow_status).toBe('todo')
    expect(spec.taskItemsQuerySchema.safeParse({ workflow_status: 'unknown' }).success).toBe(false)
    expect(
      spec.createTaskItemBodySchema.safeParse({ title: 'Bad', workflow_status: 'unknown' }).success,
    ).toBe(false)
  })

  test.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-1-1', '2026-01-01T00:00:00Z'])(
    'rejects invalid date %s',
    (due_date) => {
      expect(spec.createTaskItemBodySchema.safeParse({ title: 'Task', due_date }).success).toBe(false)
    },
  )
  test('accepts leap dates and keeps calendar dates independent of timezones', () => {
    expect(spec.createTaskItemBodySchema.parse({ title: 'Leap day', due_date: '2028-02-29' }).due_date).toBe(
      '2028-02-29',
    )
  })
  test('patches preserve omitted values and accept explicit null clears', () => {
    const patch = spec.updateTaskItemBodySchema.parse({
      due_date: null,
      expected_updated_at: '2026-11-12T10:00:00Z',
    })
    expect(patch).toEqual({ due_date: null, expected_updated_at: '2026-11-12T10:00:00Z' })
  })
  test('bounds pagination, priority and user text', () => {
    expect(spec.planningPageQuerySchema.safeParse({ per_page: 100000 }).success).toBe(false)
    expect(spec.createTaskItemBodySchema.safeParse({ title: 'Task', priority: 4 }).success).toBe(false)
    expect(spec.createTaskItemBodySchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(spec.createTaskItemBodySchema.safeParse({ title: 'x'.repeat(256) }).success).toBe(false)
    expect(spec.createTaskProjectBodySchema.safeParse({ title: '' }).success).toBe(false)
  })
  test('read-only accounts can browse but cannot mutate tasks over REST or MCP', () => {
    for (const path of ['/tasks/items', '/tasks/projects', '/tasks/board']) {
      expect(spec.isAllowedWhenReadOnly('GET', path)).toBe(true)
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        expect(spec.isAllowedWhenReadOnly(method, path)).toBe(false)
      }
    }
    for (const name of ['create_task_item', 'update_task_item', 'delete_task_project', 'update_task_board']) {
      expect(isToolAllowedWhenReadOnly(name)).toBe(false)
    }
    expect(isToolAllowedWhenReadOnly('list_task_items')).toBe(true)
    expect(isToolAllowedWhenReadOnly('get_task_board')).toBe(true)
  })
  test('bounds board metadata and rejects duplicate identifiers without patch defaults', () => {
    const version = '2026-11-12T10:00:00Z'
    expect(spec.updateTaskItemBodySchema.parse({ expected_updated_at: version })).toEqual({
      expected_updated_at: version,
    })
    for (const body of [
      { labels: Array(21).fill('tag') },
      { position: Infinity },
      { blocked_reason: 'x'.repeat(2001) },
      {
        checklist: [
          { id: 'a', title: 'A', done: false },
          { id: 'a', title: 'B', done: false },
        ],
      },
    ]) {
      expect(spec.createTaskItemBodySchema.safeParse({ title: 'Test', ...body }).success).toBe(false)
    }
    expect(spec.taskItemsQuerySchema.parse({ blocked: 'false', priority: '3' })).toMatchObject({
      blocked: false,
      priority: 3,
    })
    expect(spec.taskItemsQuerySchema.safeParse({ blocked: 'invalid' }).success).toBe(false)
  })
  test('registered tasks schema and OpenAPI are independent from the paused Kitchen', () => {
    expect(Object.keys(nativeTaskTables)).toEqual([
      'task_board_settings',
      'task_onboarding_seed',
      'task_projects',
      'task_items',
      'task_items_indexes',
    ])
    expect(Object.keys(nativeTaskPaths).every((path) => path.startsWith('/tasks/'))).toBe(true)
  })
})
