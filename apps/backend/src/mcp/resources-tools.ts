import * as spec from '@aurboda/api-spec'
import { z } from 'zod'

import type { CentralDb } from '../services/central-db.ts'

import { createResourcesService } from '../services/resources.ts'
import { jsonResponse, type McpServer } from './helpers.ts'
export const registerResourcesTools = (server: McpServer, user: string, db?: CentralDb) => {
  const service = createResourcesService(db)
  server.tool(
    'list_resources',
    'Browse the shared Resources library. File uploads use authenticated multipart POST /resources/upload; preview/download uses GET /resources/items/:id/content with bearer authentication. No server file paths or base64 uploads are accepted.',
    {},
    async () => jsonResponse(await service.list(user)),
  )
  server.tool(
    'create_resource_folder',
    'Create a shared folder (administrator only).',
    spec.createResourceFolderBodySchema.shape,
    async (body) => jsonResponse({ success: true, data: await service.createFolder(user, body) }),
  )
  server.tool(
    'update_resource_folder',
    'Rename or move a shared folder (administrator only).',
    { id: z.uuid(), ...spec.updateResourceFolderBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await service.updateFolder(user, id, body) }),
  )
  server.tool(
    'delete_resource_folder',
    'Delete a shared folder. Nonempty folders require recursive=true (administrator only).',
    { id: z.uuid(), recursive: z.boolean().optional() },
    async ({ id, recursive }) => {
      await service.deleteFolder(user, id, recursive)
      return jsonResponse({ success: true })
    },
  )
  server.tool(
    'create_resource_link',
    'Add an external HTTP/HTTPS link (administrator only).',
    spec.createResourceLinkBodySchema.shape,
    async (body) => jsonResponse({ success: true, data: await service.createLink(user, body) }),
  )
  server.tool(
    'update_resource',
    'Edit a resource title, description, folder, or link URL (administrator only).',
    { id: z.uuid(), ...spec.updateResourceItemBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await service.updateItem(user, id, body) }),
  )
  server.tool(
    'delete_resource',
    'Delete a resource (administrator only).',
    { id: z.uuid() },
    async ({ id }) => {
      await service.deleteItem(user, id)
      return jsonResponse({ success: true })
    },
  )
}
