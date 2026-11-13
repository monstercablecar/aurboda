import { expect, test, vi } from 'vitest'

import type { McpServer } from './helpers.ts'

import { isMutatingMcpTool } from '../services/usage-channel.ts'
import { saveWorkDay } from '../services/work-day.ts'
import { registerWorkTools } from './work-tools.ts'
vi.mock('../services/work-day.ts', () => ({ saveWorkDay: vi.fn().mockResolvedValue({}) }))
test('set_work_day shares REST service and read-only mutation classification', async () => {
  const tool = vi.fn()
  registerWorkTools({ tool } as unknown as McpServer, 'owner')
  expect(tool.mock.calls[0][0]).toBe('set_work_day')
  expect(isMutatingMcpTool('set_work_day')).toBe(true)
  await tool.mock.calls[0][3]({ profile_id: 'recruiting' })
  expect(saveWorkDay).toHaveBeenCalledWith('owner', { profile_id: 'recruiting' }, undefined)
})
