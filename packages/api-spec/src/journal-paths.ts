import { z } from 'zod'

import * as j from './schemas/journal.ts'

const operation = (
  summary: string,
  schema: z.ZodType,
  body?: z.ZodType,
  id = false,
  query?: z.ZodObject,
  created = false,
) => ({
  summary,
  tags: ['Journal'],
  security: [{ bearerAuth: [] }],
  ...(id || query
    ? { requestParams: { ...(id ? { path: z.object({ id: z.uuid() }) } : {}), ...(query ? { query } : {}) } }
    : {}),
  ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
  responses: {
    [created ? 201 : 200]: {
      description: 'Successful response',
      content: { 'application/json': { schema } },
    },
    400: { description: 'Invalid input' },
    401: { description: 'Authentication required' },
    404: { description: 'Not found in this account' },
    409: { description: 'Version conflict; reload the current record' },
  },
})
export const journalPaths = {
  '/journal/capabilities': {
    get: operation('Discover Journal readers and media limits', j.journalCapabilitiesResponseSchema),
  },
  '/journal/catalog': {
    get: operation('List sourced guided journal workbooks', j.journalCatalogResponseSchema),
  },
  '/journal/entries': {
    get: operation(
      'List private journal entries',
      j.journalEntriesResponseSchema,
      undefined,
      false,
      j.journalEntriesQuerySchema,
    ),
    post: operation(
      'Create a journal entry',
      j.journalEntryResponseSchema,
      j.createJournalEntryBodySchema,
      false,
      undefined,
      true,
    ),
  },
  '/journal/entries/{id}': {
    get: operation('Read a private journal entry', j.journalEntryResponseSchema, undefined, true),
    patch: operation(
      'Update a journal entry with version checking',
      j.journalEntryResponseSchema,
      j.updateJournalEntryBodySchema,
      true,
    ),
    delete: operation(
      'Permanently delete a journal entry; must already be trashed',
      j.journalSuccessResponseSchema,
      undefined,
      true,
      j.journalDeleteQuerySchema,
    ),
  },
  '/journal/areas': {
    get: operation('List private journal areas', j.journalAreasResponseSchema),
    post: operation(
      'Create a journal area',
      j.journalAreaResponseSchema,
      j.createJournalAreaBodySchema,
      false,
      undefined,
      true,
    ),
  },
  '/journal/areas/{id}': {
    patch: operation(
      'Update a journal area with version checking',
      j.journalAreaResponseSchema,
      j.updateJournalAreaBodySchema,
      true,
    ),
    delete: operation(
      'Permanently delete a journal area',
      j.journalSuccessResponseSchema,
      undefined,
      true,
      j.journalDeleteQuerySchema,
    ),
  },
  '/journal/templates': {
    get: operation('List private journal templates', j.journalTemplatesResponseSchema),
    post: operation(
      'Create a journal template',
      j.journalTemplateResponseSchema,
      j.createJournalTemplateBodySchema,
      false,
      undefined,
      true,
    ),
  },
  '/journal/templates/{id}': {
    patch: operation(
      'Update a journal template with version checking',
      j.journalTemplateResponseSchema,
      j.updateJournalTemplateBodySchema,
      true,
    ),
    delete: operation(
      'Permanently delete a journal template',
      j.journalSuccessResponseSchema,
      undefined,
      true,
      j.journalDeleteQuerySchema,
    ),
  },
  '/journal/entries/{id}/revisions': {
    get: operation('Read the 100 newest entry revisions', j.journalRevisionsResponseSchema, undefined, true),
  },
  '/journal/entries/{id}/attachments': {
    get: operation(
      'List private entry attachment metadata',
      j.journalAttachmentsResponseSchema,
      undefined,
      true,
    ),
    post: {
      ...operation(
        'Upload an original audio/image attachment (20 MB maximum)',
        j.journalAttachmentResponseSchema,
        undefined,
        true,
        undefined,
        true,
      ),
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: z.object({
              file: z.string().meta({ format: 'binary' }),
              prompt_id: z.string().max(200).optional(),
            }),
          },
        },
      },
    },
  },
  '/journal/attachments/{id}': {
    get: {
      ...operation(
        'Download original attachment bytes with bearer authentication',
        j.journalAttachmentResponseSchema,
        undefined,
        true,
      ),
      responses: {
        200: {
          description:
            'Original private file bytes; accepts the account bearer token or an authorized OAuth read token. No public URL or cookie authentication.',
          content: { 'application/octet-stream': { schema: z.string().meta({ format: 'binary' }) } },
        },
        401: { description: 'Authentication required' },
        404: { description: 'Not found in this account' },
      },
    },
    delete: operation(
      'Permanently delete a private attachment',
      j.journalSuccessResponseSchema,
      undefined,
      true,
    ),
  },
}
