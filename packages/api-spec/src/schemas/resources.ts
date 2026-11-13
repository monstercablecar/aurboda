import { z } from 'zod'

export const resourceKindSchema = z
  .enum(['pdf', 'image', 'video', 'document', 'link'])
  .meta({ id: 'ResourceKind', description: 'Shared resource type' })
const title = z.string().trim().min(1).max(255)
const parent = z.string().uuid().nullable()
export const resourceFolderSchema = z
  .object({ id: z.string().uuid(), title, parent_id: parent, created_at: z.string(), updated_at: z.string() })
  .meta({ id: 'ResourceFolder', description: 'Shared library folder' })
export const resourceItemSchema = resourceFolderSchema
  .extend({
    kind: resourceKindSchema,
    original_filename: z.string().nullable(),
    external_url: z.string().nullable(),
    mime_type: z.string().nullable(),
    file_size: z.number().nullable(),
    description: z.string().nullable(),
    created_by: z.string(),
  })
  .meta({ id: 'ResourceItem', description: 'Shared library resource' })
export const resourceUrlSchema = z
  .string()
  .url()
  .max(4096)
  .refine((value) => {
    const u = new URL(value)
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
  }, 'Use an HTTP or HTTPS URL without credentials')
export const createResourceFolderBodySchema = z
  .object({ title, parent_id: parent.optional() })
  .strict()
  .meta({ id: 'CreateResourceFolderBody', description: 'Create a shared folder' })
export const updateResourceFolderBodySchema = createResourceFolderBodySchema
  .partial()
  .extend({ expected_updated_at: z.string().optional() })
  .meta({ id: 'UpdateResourceFolderBody', description: 'Rename or move a folder' })
export const resourceUploadBodySchema = createResourceFolderBodySchema
  .extend({ description: z.string().max(10000).nullable().optional() })
  .meta({ id: 'ResourceUploadBody', description: 'Multipart file metadata' })
export const createResourceLinkBodySchema = resourceUploadBodySchema
  .extend({ external_url: resourceUrlSchema })
  .meta({ id: 'CreateResourceLinkBody', description: 'Add an external link' })
export const updateResourceItemBodySchema = createResourceLinkBodySchema
  .partial()
  .extend({ expected_updated_at: z.string().optional() })
  .meta({ id: 'UpdateResourceItemBody', description: 'Edit shared resource metadata' })
export const resourcesResponseSchema = z
  .object({
    success: z.boolean(),
    folders: z.array(resourceFolderSchema),
    resources: z.array(resourceItemSchema),
    can_manage: z.boolean(),
  })
  .meta({ id: 'ResourcesResponse', description: 'Shared library metadata' })
export const resourceFolderResponseSchema = z
  .object({ success: z.boolean(), data: resourceFolderSchema })
  .meta({ id: 'ResourceFolderResponse', description: 'Folder result' })
export const resourceItemResponseSchema = z
  .object({ success: z.boolean(), data: resourceItemSchema })
  .meta({ id: 'ResourceItemResponse', description: 'Resource result' })
export const resourceSuccessResponseSchema = z
  .object({ success: z.boolean() })
  .meta({ id: 'ResourceSuccessResponse', description: 'Successful operation' })
export const resourceDeleteQuerySchema = z
  .object({ recursive: z.enum(['true', 'false']).optional() })
  .meta({ id: 'ResourceDeleteQuery', description: 'Confirm recursive folder deletion' })
export const resourceContentQuerySchema = z
  .object({ download: z.enum(['1']).optional() })
  .meta({ id: 'ResourceContentQuery', description: 'Download original file' })
export type ResourceKind = z.infer<typeof resourceKindSchema>
export type ResourceFolder = z.infer<typeof resourceFolderSchema>
export type ResourceItem = z.infer<typeof resourceItemSchema>
export type CreateResourceFolderBody = z.infer<typeof createResourceFolderBodySchema>
export type UpdateResourceFolderBody = z.infer<typeof updateResourceFolderBodySchema>
export type CreateResourceLinkBody = z.infer<typeof createResourceLinkBodySchema>
export type UpdateResourceItemBody = z.infer<typeof updateResourceItemBodySchema>
export type ResourceUploadBody = z.infer<typeof resourceUploadBodySchema>
export type ResourcesResponse = z.infer<typeof resourcesResponseSchema>
export type ResourceFolderResponse = z.infer<typeof resourceFolderResponseSchema>
export type ResourceItemResponse = z.infer<typeof resourceItemResponseSchema>
export type ResourceSuccessResponse = z.infer<typeof resourceSuccessResponseSchema>
export type ResourceDeleteQuery = z.infer<typeof resourceDeleteQuerySchema>
export type ResourceContentQuery = z.infer<typeof resourceContentQuerySchema>
