import { z } from 'zod'

// Local privacy exception: these schemas have no public OpenAPI paths or MCP tools.
export const familyEditSchema = z
  .object({
    caption: z.string().max(2000).optional(),
    captured_at: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .meta({ id: 'FamilyEdit', description: 'Private family media caption and capture date' })
export const familyMembershipSchema = z
  .object({ family_member: z.boolean() })
  .strict()
  .meta({ id: 'FamilyMembership', description: 'Independent administrator-controlled family designation' })
export const familyQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    kind: z.enum(['photo', 'video']).optional(),
    trash: z.enum(['true', 'false']).optional(),
    album_id: z.union([z.string().uuid(), z.literal('unfiled')]).optional(),
    from_offset: z.coerce.number().int().min(-840).max(840).optional(),
    to_offset: z.coerce.number().int().min(-840).max(840).optional(),
    from_date: z.iso
      .date()
      .refine((value) => value >= '0001-01-01')
      .optional(),
    to_date: z.iso
      .date()
      .refine((value) => value >= '0001-01-01')
      .optional(),
  })
  .strict()
  .refine((value) => !value.from_date || !value.to_date || value.from_date <= value.to_date, {
    message: 'The end date must follow the start date',
  })
  .meta({ id: 'FamilyQuery', description: 'Private family gallery pagination' })
export const familyItemSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['photo', 'video']),
    caption: z.string(),
    original_filename: z.string(),
    created_at: z.string(),
    captured_at: z.string().nullable(),
    deleted_at: z.string().nullable(),
    status: z.enum(['queued', 'processing', 'ready', 'failed', 'purging']),
    original_bytes: z.number(),
    is_owner: z.boolean(),
    album_id: z.string().uuid().nullable(),
  })
  .meta({ id: 'FamilyItem', description: 'Private shared family media' })
export type FamilyItem = z.infer<typeof familyItemSchema>
export type FamilyEdit = z.infer<typeof familyEditSchema>
export type FamilyQuery = z.infer<typeof familyQuerySchema>
export type FamilyMembership = z.infer<typeof familyMembershipSchema>
export interface FamilyAccess {
  enabled: boolean
  allowed: boolean
  is_admin: boolean
  originals_enabled: boolean
  max_upload_bytes: number
}
export interface FamilyAccessResponse {
  success: boolean
  data: FamilyAccess
}
export interface FamilyItemsResponse {
  success: boolean
  items: FamilyItem[]
  next_cursor: string | null
}
export interface FamilyItemResponse {
  success: boolean
  data: FamilyItem
}
export interface FamilySuccessResponse {
  success: boolean
  error?: string
}
export interface FamilyMembersResponse {
  success: boolean
  members: { username: string; family_member: boolean }[]
}

// Private REST-only organization. Folder names are metadata, never filesystem paths.
export const familyFolderNameSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[^\u0000-\u001f\u007f]+$/u),
  })
  .strict()
export const familyMoveSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
    album_id: z.string().uuid().nullable(),
  })
  .strict()
export interface FamilyFolder {
  id: string
  name: string
  count: number
}
export interface FamilyFoldersResponse {
  success: boolean
  folders: FamilyFolder[]
}
export interface FamilyFolderResponse {
  success: boolean
  folder: FamilyFolder
}
export type FamilyFolderName = z.infer<typeof familyFolderNameSchema>
export type FamilyMove = z.infer<typeof familyMoveSchema>

export const familyUploadSchema = z
  .object({ caption: z.string().max(2000).optional(), album_id: z.string().uuid().optional() })
  .strict()
