import { expect, test, vi } from 'vitest'

import type { McpServer } from './helpers.ts'

import { registerPharmacologyTools } from './pharmacology-tools.ts'
const actions = vi.hoisted(() => ({
  createQuestionnaire: vi.fn(async () => ({ id: 'template' })),
  updateQuestionnaire: vi.fn(async () => ({ id: 'template' })),
  getQuestionnaireCatalog: vi.fn(() => []),
}))
vi.mock('../services/pharmacology.ts', () => actions)
test('library REST counterparts bind mutations to the authenticated MCP account', async () => {
  const tool = vi.fn()
  registerPharmacologyTools({ tool } as unknown as McpServer, 'authenticated-owner')
  const create = tool.mock.calls.find(([name]) => name === 'create_questionnaire')!
  const update = tool.mock.calls.find(([name]) => name === 'update_questionnaire')!
  expect(create[2]).not.toHaveProperty('user')
  expect(create[2]).toHaveProperty('library')
  await create[3]({ display_name: 'Personal' })
  expect(actions.createQuestionnaire).toHaveBeenCalledWith('authenticated-owner', {
    display_name: 'Personal',
  })
  await update[3]({ id: 'template', display_name: 'Revised' })
  expect(actions.updateQuestionnaire).toHaveBeenCalledWith('authenticated-owner', 'template', {
    display_name: 'Revised',
  })
  await tool.mock.calls.find(([name]) => name === 'list_assessment_instruments')![3]({})
  expect(actions.getQuestionnaireCatalog).toHaveBeenCalledOnce()
})
