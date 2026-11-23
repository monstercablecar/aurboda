import { z } from 'zod'

// Local privacy exception: these schemas have no public OpenAPI paths or MCP tools.
export const familyEditSchema = z
  .object({ caption: z.string().max(2000).optional(), captured_at: z.iso.datetime().nullable().optional() })
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
  })
  .strict()
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
