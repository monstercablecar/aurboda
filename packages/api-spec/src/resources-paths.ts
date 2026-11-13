import { z } from 'zod'

import * as r from './schemas/resources.ts'

const operation = (
  summary: string,
  schema: z.ZodType,
  body?: z.ZodType,
  id = false,
  query?: z.ZodObject,
  multipart = false,
  created = false,
) => ({
  summary,
  tags: ['Resources'],
  security: [{ bearerAuth: [] }],
  ...(id || query
    ? { requestParams: { ...(id ? { path: z.object({ id: z.uuid() }) } : {}), ...(query ? { query } : {}) } }
    : {}),
  ...(body
    ? {
        requestBody: {
          required: true,
          content: { [multipart ? 'multipart/form-data' : 'application/json']: { schema: body } },
        },
      }
    : {}),
  responses: {
    [created ? 201 : 200]: {
      description: 'Successful response',
      content: { 'application/json': { schema } },
    },
    400: { description: 'Invalid input' },
    401: { description: 'Authentication required' },
    403: { description: 'Administrator required' },
    404: { description: 'Not found' },
    409: { description: 'Conflict; reload changed metadata or explicitly confirm recursive deletion' },
  },
})

const content = {
  ...operation(
    'Preview or download an authenticated file',
    r.resourceSuccessResponseSchema,
    undefined,
    true,
    r.resourceContentQuerySchema,
  ),
  description:
    'Accepts bearer authentication or the opaque HttpOnly cookie established by POST /resources/session. Supports a single HTTP Range request, including suffix ranges, without loading the file into memory. Documents are attachment-only. All responses are private and not cached.',
  requestParams: {
    path: z.object({ id: z.uuid() }),
    query: r.resourceContentQuerySchema,
    header: z.object({ Range: z.string().optional() }),
  },
  responses: {
    200: {
      description: 'File content',
      content: { 'application/octet-stream': { schema: z.string().meta({ format: 'binary' }) } },
    },
    206: { description: 'Partial file content; Content-Range identifies returned bytes' },
    400: { description: 'Invalid resource identifier or query' },
    401: { description: 'Authentication required or media session expired' },
    404: { description: 'File unavailable' },
    416: { description: 'Unsatisfiable byte range' },
  },
}

export const resourcesPaths = {
  '/resources': { get: operation('List the shared library', r.resourcesResponseSchema) },
  '/resources/session': {
    post: operation('Establish a 15-minute HttpOnly media cookie', r.resourceSuccessResponseSchema),
    delete: {
      ...operation('Clear and revoke the current media session', r.resourceSuccessResponseSchema),
      security: [],
    },
  },
  '/resources/folders': {
    post: operation(
      'Create a shared folder (administrator only)',
      r.resourceFolderResponseSchema,
      r.createResourceFolderBodySchema,
      false,
      undefined,
      false,
      true,
    ),
  },
  '/resources/folders/{id}': {
    patch: operation(
      'Rename or move a folder (administrator only)',
      r.resourceFolderResponseSchema,
      r.updateResourceFolderBodySchema,
      true,
    ),
    delete: operation(
      'Delete a folder; nonempty deletion requires recursive=true (administrator only)',
      r.resourceSuccessResponseSchema,
      undefined,
      true,
      r.resourceDeleteQuerySchema,
    ),
  },
  '/resources/links': {
    post: operation(
      'Create an external link (administrator only)',
      r.resourceItemResponseSchema,
      r.createResourceLinkBodySchema,
      false,
      undefined,
      false,
      true,
    ),
  },
  '/resources/items/{id}': {
    patch: operation(
      'Update resource metadata (administrator only)',
      r.resourceItemResponseSchema,
      r.updateResourceItemBodySchema,
      true,
    ),
    delete: operation(
      'Delete a resource (administrator only)',
      r.resourceSuccessResponseSchema,
      undefined,
      true,
    ),
  },
  '/resources/upload': {
    post: {
      ...operation(
        'Upload a file (administrator only)',
        r.resourceItemResponseSchema,
        r.resourceUploadBodySchema.extend({ file: z.string().meta({ format: 'binary' }) }),
        false,
        undefined,
        true,
        true,
      ),
      responses: {
        ...operation('', r.resourceItemResponseSchema, undefined, false, undefined, false, true).responses,
        413: { description: 'File exceeds the configured upload limit' },
        415: { description: 'Unsupported type or mismatched content signature/MIME' },
        507: { description: 'Insufficient storage' },
      },
    },
  },
  '/resources/items/{id}/content': {
    get: content,
    head: {
      ...content,
      summary: 'Check authenticated file availability and metadata',
      responses: {
        200: { description: 'File headers without content' },
        401: { description: 'Authentication required' },
        404: { description: 'File unavailable' },
      },
    },
  },
}
