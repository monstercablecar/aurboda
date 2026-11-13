import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { expect, test } from 'vitest'

import { restrictToAnalysisReads } from './connector-permissions.ts'
import { registeredTools } from './tool-catalogue.ts'

test('future read-named tools stay unavailable until explicitly reviewed', () => {
  const server = new McpServer({ name: 'permission-test', version: '1' })
  const callback = async () => ({ content: [] })
  server.tool('query_notes', 'Known data reader', {}, callback)
  server.tool('get_unreviewed_sensitive_data', 'New reader', {}, callback)
  server.tool('export_data_dump', 'Credential-bearing export', {}, callback)
  server.tool('delete_my_account', 'Plan gate exception', {}, callback)
  restrictToAnalysisReads(server)
  const tools = registeredTools(server)
  expect(tools.query_notes.enabled).toBe(true)
  expect(tools.get_unreviewed_sensitive_data.enabled).toBe(false)
  expect(tools.export_data_dump.enabled).toBe(false)
  expect(tools.delete_my_account.enabled).toBe(false)
})
