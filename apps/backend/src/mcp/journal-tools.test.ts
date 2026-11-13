import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { expect, test, vi } from 'vitest'

import { isMutatingMcpTool } from '../services/usage-channel.ts'
import { decodeJournalAttachmentBase64, registerJournalTools } from './journal-tools.ts'
import { installToolCatalogue, registeredTools } from './tool-catalogue.ts'

vi.mock('../services/journal-catalog.ts', () => ({ JOURNAL_CATALOG: [] }))
vi.mock('../services/journal.ts', () => ({}))

test('journal tools enter existing discovery with guarded mutation names and full parameter schemas', () => {
  const server = new McpServer({ name: 'journal-test', version: '1' })
  registerJournalTools(server, 'session-owner')
  installToolCatalogue(server)
  const tools = registeredTools(server)
  const names = Object.keys(tools)
  expect(names).toContain('describe_tools')
  expect(names.filter((name) => name.includes('journal'))).toHaveLength(20)
  expect(tools.update_journal_entry.inputSchema).toBeDefined()
  expect(tools.list_journal_entries.inputSchema).toBeDefined()
  for (const toolName of names.filter((name) => name.includes('journal'))) {
    expect(isMutatingMcpTool(toolName)).toBe(/^(create|update|delete)_/.test(toolName))
  }
  expect(tools.list_journal_attachments.description).toContain('same OAuth read token')
  expect(tools.list_journal_attachments.description).toContain(
    'multipart POST /journal/entries/:id/attachments',
  )
})

test('MCP attachment bytes are canonical base64 and bounded before service calls', () => {
  const bytes = Buffer.from([0, 255, 128, 13, 10])
  expect(decodeJournalAttachmentBase64(bytes.toString('base64'))).toEqual(bytes)
  expect(() => decodeJournalAttachmentBase64('not base64')).toThrow()
  expect(() => decodeJournalAttachmentBase64('AB==')).toThrow()
  expect(() => decodeJournalAttachmentBase64(Buffer.alloc(1024 * 1024 + 1).toString('base64'))).toThrow()
})
