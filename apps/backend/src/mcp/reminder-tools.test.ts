import { expect, test, vi } from 'vitest'

import type { McpServer } from './helpers.ts'

import { httpError } from '../http-error.ts'
import { reminderActions } from '../services/reminders.ts'
import { registerReminderTools } from './reminder-tools.ts'

test('reminder MCP matches REST and binds every operation to authenticated owner', async () => {
  const tool = vi.fn()
  const actions = {
    ...reminderActions,
    list: vi.fn(async () => []),
    test: vi.fn(async () => true),
    ready: () => false,
  }
  registerReminderTools({ tool } as unknown as McpServer, 'owner', actions)
  expect(tool.mock.calls.map(([name]) => name)).toEqual([
    'list_reminders',
    'add_reminder',
    'update_reminder',
    'delete_reminder',
    'test_reminder_notification',
  ])
  await tool.mock.calls.find(([name]) => name === 'list_reminders')![3]()
  expect(actions.list).toHaveBeenCalledWith('owner')
  await tool.mock.calls.find(([name]) => name === 'test_reminder_notification')![3]({ id: 'test-id' })
  expect(actions.test).toHaveBeenCalledWith('owner', 'test-id')
  actions.test.mockRejectedValueOnce(httpError(409, 'Wait one minute.'))
  const result = await tool.mock.calls.find(([name]) => name === 'test_reminder_notification')![3]({
    id: 'test-id',
  })
  expect(result.isError).toBe(true)
})
