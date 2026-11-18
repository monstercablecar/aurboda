import { addTreatmentReflectionSchema } from '@aurboda/api-spec'
import { expect, test, vi } from 'vitest'

import type { McpServer } from './helpers.ts'

import { httpError } from '../http-error.ts'
import { treatmentCheckinActions } from '../services/treatment-checkins.ts'
import { registerTreatmentCheckinTools } from './treatment-checkin-tools.ts'

test('six check-in MCP operations mirror REST and use the authenticated user', async () => {
  const tool = vi.fn()
  const actions = {
    ...treatmentCheckinActions,
    list: vi.fn(async () => ({ data: [], plan: null, scheduler_ready: false })),
    settings: vi.fn(async () => {}),
  }
  registerTreatmentCheckinTools({ tool } as unknown as McpServer, 'owner', actions)
  expect(tool.mock.calls).toHaveLength(6)
  await tool.mock.calls.find(([name]) => name === 'list_treatment_checkins')![3]({
    treatment_session_id: 'session',
  })
  expect(actions.list).toHaveBeenCalledWith('owner', 'session')
  await tool.mock.calls.find(([name]) => name === 'update_treatment_checkin_settings')![3]({
    id: 'session',
    reminders_enabled: false,
  })
  expect(actions.settings).toHaveBeenCalledWith('owner', 'session', { reminders_enabled: false })
  actions.settings.mockRejectedValueOnce(httpError(404, 'Session not found.'))
  expect(
    (
      await tool.mock.calls.find(([name]) => name === 'update_treatment_checkin_settings')![3]({
        id: 'missing',
      })
    ).isError,
  ).toBe(true)
})

test('MCP reflection contract cannot create custom plan entries', () => {
  expect(
    addTreatmentReflectionSchema.safeParse({
      treatment_session_id: '11111111-1111-4111-8111-111111111111',
      kind: 'custom',
    }).success,
  ).toBe(false)
})
