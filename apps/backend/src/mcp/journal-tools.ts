import * as spec from '@aurboda/api-spec'
import { z } from 'zod'

import { httpError } from '../http-error.ts'
import { JOURNAL_CATALOG } from '../services/journal-catalog.ts'
import * as service from '../services/journal.ts'
import { jsonResponse, type McpServer } from './helpers.ts'

export const registerJournalTools = (server: McpServer, user: string) => {
  server.tool(
    'get_journal_capabilities',
    'Discover authorized Journal readers, search filters, workbook context and original-media limits.',
    {},
    async () => jsonResponse({ success: true, data: service.getJournalCapabilities() }),
  )
  server.tool('get_journal_catalog', 'List sourced guided journal workbooks and exercises.', {}, async () =>
    jsonResponse({ success: true, data: JOURNAL_CATALOG }),
  )
  server.tool(
    'list_journal_entries',
    'Search private journal entries with filters and pagination.',
    spec.journalEntriesQuerySchema.shape,
    async (query) => jsonResponse({ success: true, ...(await service.listJournalEntries(user, query)) }),
  )
  server.tool(
    'get_journal_entry',
    'Read a private journal entry, including its immutable workbook snapshot.',
    { id: z.uuid() },
    async ({ id }) => jsonResponse({ success: true, data: await service.getJournalEntry(user, id) }),
  )
  server.tool(
    'create_journal_entry',
    'Create a private journal entry. Use workbook_id to start a fresh server-defined workbook attempt, or template_id to copy a template. Optional client UUID makes identical retries idempotent.',
    spec.createJournalEntryBodySchema.shape,
    async (body) => jsonResponse({ success: true, data: await service.createJournalEntry(user, body) }),
  )
  server.tool(
    'update_journal_entry',
    'Update a private journal entry. Updates require the current expected_updated_at.',
    { id: z.uuid(), ...spec.updateJournalEntryBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await service.updateJournalEntry(user, id, body) }),
  )
  server.tool(
    'delete_journal_entry',
    'Permanently delete a private journal entry with version checking. Entries must first be moved to trash.',
    { id: z.uuid(), ...spec.journalDeleteQuerySchema.shape },
    async ({ id, expected_updated_at }) => {
      await service.deleteJournalEntry(user, id, expected_updated_at)
      return jsonResponse({ success: true })
    },
  )
  server.tool('list_journal_areas', 'List private journal areas.', {}, async () =>
    jsonResponse({ success: true, data: await service.listJournalAreas(user) }),
  )
  server.tool(
    'create_journal_area',
    'Create a private journal area. General is represented by null, not an area row.',
    spec.createJournalAreaBodySchema.shape,
    async (body) => jsonResponse({ success: true, data: await service.createJournalArea(user, body) }),
  )
  server.tool(
    'update_journal_area',
    'Update a private journal area. Updates require the current expected_updated_at.',
    { id: z.uuid(), ...spec.updateJournalAreaBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await service.updateJournalArea(user, id, body) }),
  )
  server.tool(
    'delete_journal_area',
    'Permanently delete a private journal area with version checking.',
    { id: z.uuid(), ...spec.journalDeleteQuerySchema.shape },
    async ({ id, expected_updated_at }) => {
      await service.deleteJournalArea(user, id, expected_updated_at)
      return jsonResponse({ success: true })
    },
  )
  server.tool('list_journal_templates', 'List private journal templates.', {}, async () =>
    jsonResponse({ success: true, data: await service.listJournalTemplates(user) }),
  )
  server.tool(
    'create_journal_template',
    'Create a reusable private Markdown journal template.',
    spec.createJournalTemplateBodySchema.shape,
    async (body) => jsonResponse({ success: true, data: await service.createJournalTemplate(user, body) }),
  )
  server.tool(
    'update_journal_template',
    'Update a private journal template. Updates require the current expected_updated_at.',
    { id: z.uuid(), ...spec.updateJournalTemplateBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await service.updateJournalTemplate(user, id, body) }),
  )
  server.tool(
    'delete_journal_template',
    'Permanently delete a private journal template with version checking.',
    { id: z.uuid(), ...spec.journalDeleteQuerySchema.shape },
    async ({ id, expected_updated_at }) => {
      await service.deleteJournalTemplate(user, id, expected_updated_at)
      return jsonResponse({ success: true })
    },
  )
  server.tool('list_journal_revisions', 'List journal entry revisions.', { id: z.uuid() }, async ({ id }) =>
    jsonResponse({ success: true, data: await service.listJournalRevisions(user, id) }),
  )
  server.tool(
    'list_journal_attachments',
    'List journal entry attachments. Upload original audio/images using authenticated multipart POST /journal/entries/:id/attachments (file, optional prompt_id; 20 MB). Download original bytes using GET /api/journal/attachments/:id with the same OAuth read token (or account bearer token). No public URLs are issued.',
    { id: z.uuid() },
    async ({ id }) => jsonResponse({ success: true, data: await service.listJournalAttachments(user, id) }),
  )
  server.tool(
    'create_journal_attachment',
    'Upload original private audio/image bytes as base64 (maximum 1 MiB decoded). For larger files use authenticated REST multipart POST /journal/entries/:id/attachments, up to 20 MiB.',
    spec.createJournalAttachmentBodySchema.shape,
    async ({ entry_id, data_base64, ...metadata }) => {
      const bytes = decodeJournalAttachmentBase64(data_base64)
      return jsonResponse({
        success: true,
        data: await service.addJournalAttachment(user, entry_id, { ...metadata, bytes }),
      })
    },
  )
  server.tool(
    'get_journal_attachment',
    'Download private original attachment bytes as base64 (maximum 1 MiB). Larger files require GET /api/journal/attachments/:id with the same OAuth read token (or account bearer token).',
    { id: z.uuid() },
    async ({ id }) => {
      const { metadata, bytes } = await service.getJournalAttachment(user, id)
      if (bytes.length > spec.journalMcpAttachmentBytes) {
        throw httpError(
          413,
          'Use GET /api/journal/attachments/:id with your OAuth read token for attachments larger than 1 MiB.',
        )
      }
      return jsonResponse({ success: true, data: metadata, data_base64: bytes.toString('base64') })
    },
  )
  server.tool(
    'delete_journal_attachment',
    'Permanently delete a private journal attachment.',
    { id: z.uuid() },
    async ({ id }) => {
      await service.deleteJournalAttachment(user, id)
      return jsonResponse({ success: true })
    },
  )
}

export const decodeJournalAttachmentBase64 = (data: string): Buffer => {
  const parsed = spec.journalAttachmentBase64Schema.safeParse(data)
  if (!parsed.success) throw httpError(400, 'Invalid or oversized base64 attachment.')
  const bytes = Buffer.from(parsed.data, 'base64')
  if (bytes.length > spec.journalMcpAttachmentBytes) {
    throw httpError(413, 'Use authenticated REST upload for attachments larger than 1 MiB.')
  }
  if (bytes.toString('base64') !== data) throw httpError(400, 'Invalid base64 attachment.')
  return bytes
}
