import type { FamilyAccess, FamilyEdit, FamilyItem, FamilyQuery } from '@aurboda/api-spec'

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'

import type { Queryable } from '../db/pool.ts'
import type { CentralDb } from './central-db.ts'

import { httpError } from '../http-error.ts'
import { processFamilyMedia, probeFamilyVideo } from './family-process.ts'
import {
  familyEnabled,
  familyFilename,
  familyHash,
  familyId,
  familyLimit,
  familyMaxDerivative,
  familyMaxUpload,
  familyPath,
  familyRoot,
  familySpace,
  familyWorkspace,
  safeFamilyFile,
  sniffFamily,
  syncFamilyFile,
} from './family-storage.ts'

export const CREATE_FAMILY_TABLES = `
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS family_member BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS family_media (
 id UUID PRIMARY KEY, sha256 CHAR(64) NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('photo','video')),
 mime_type TEXT NOT NULL, source_format TEXT NOT NULL, original_filename TEXT NOT NULL, original_bytes BIGINT NOT NULL,
 reserved_bytes BIGINT NOT NULL DEFAULT 0, derivative_bytes BIGINT NOT NULL DEFAULT 0,
 caption TEXT NOT NULL DEFAULT '', captured_at TIMESTAMPTZ, album_id UUID,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed','purging')),
 created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS family_media_chronology ON family_media(created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS family_uploads(id UUID PRIMARY KEY, reserved_bytes BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`
interface MediaRow extends Omit<FamilyItem, 'created_at' | 'captured_at' | 'deleted_at'> {
  created_at: Date
  captured_at: Date | null
  deleted_at: Date | null
  mime_type: string
  source_format: string
  sha256: string
}
const serialize = (row: MediaRow): FamilyItem => ({
  id: row.id,
  kind: row.kind,
  caption: row.caption,
  original_filename: row.original_filename,
  original_bytes: Number(row.original_bytes),
  album_id: row.album_id,
  status: row.status,
  created_at: row.created_at.toISOString(),
  captured_at: row.captured_at?.toISOString() ?? null,
  deleted_at: row.deleted_at?.toISOString() ?? null,
})
export const createFamilyService = (db: Pick<CentralDb, 'resourcesClient' | 'resourcesTransaction'>) => {
  const client = () => db.resourcesClient()
  const access = async (user: string, tx?: Queryable): Promise<FamilyAccess> => {
    const enabled = familyEnabled()
    const result = enabled
      ? await (tx ?? (await client())).query<{ family_member: boolean; is_admin: boolean }>(
          `SELECT u.family_member, EXISTS(SELECT 1 FROM admins a WHERE a.username=u.username) AS is_admin
       FROM user_accounts u WHERE u.username=$1 AND NOT EXISTS(SELECT 1 FROM deleted_usernames d WHERE d.username=u.username)`,
          [user],
        )
      : null
    const row = result?.rows[0]
    return {
      enabled,
      allowed: !!row && (row.family_member || row.is_admin),
      is_admin: row?.is_admin === true,
      originals_enabled: process.env.FAMILY_ALLOW_MEMBER_ORIGINALS === 'true',
      max_upload_bytes: familyMaxUpload(),
    }
  }
  const requireAccess = async (user: string, admin = false, tx?: Queryable) => {
    const role = await access(user, tx)
    if (!role.enabled) throw httpError(404, 'Family Photos is unavailable')
    if (!role.allowed || (admin && !role.is_admin)) throw httpError(403, 'Family Photos access denied')
    return role
  }
  const item = async (user: string, id: string, tx?: Queryable) => {
    const role = await requireAccess(user, false, tx)
    const row = (
      await (tx ?? (await client())).query<MediaRow>('SELECT * FROM family_media WHERE id=$1', [familyId(id)])
    ).rows[0]
    if (!row || row.status === 'purging' || (row.deleted_at && !role.is_admin)) {
      throw httpError(404, 'Media not found')
    }
    return row
  }
  const cancel = async (id: string) => {
    await rm(await familyPath(id), { recursive: true, force: true })
    await (await client()).query('DELETE FROM family_uploads WHERE id=$1', [id])
  }
  let ticking = false
  const tick = async () => {
    if (ticking || !familyEnabled()) return
    ticking = true
    try {
      await db.resourcesTransaction(async (tx) => {
        if (
          !(await tx.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock(638294017) AS locked'))
            .rows[0].locked
        ) {
          return
        }
        // Lock persists across conversion: a crash rolls the row back to queued; another instance cannot overlap.
        const row = (
          await tx.query<MediaRow>(
            "SELECT * FROM family_media WHERE status='queued' AND deleted_at IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
          )
        ).rows[0]
        if (row) {
          try {
            const processed = await processFamilyMedia(row.id, row.kind, row.source_format)
            await tx.query(
              "UPDATE family_media SET status='ready',captured_at=COALESCE(captured_at,$2),derivative_bytes=$3,reserved_bytes=0 WHERE id=$1",
              [row.id, processed.captured_at, processed.size],
            )
          } catch {
            await rm(await familyPath(row.id, 'preview.mp4'), { force: true })
            await rm(await familyPath(row.id, 'preview.webp'), { force: true })
            await rm(await familyPath(row.id, 'thumb.webp'), { force: true })
            await tx.query("UPDATE family_media SET status='failed',reserved_bytes=0 WHERE id=$1", [row.id])
          }
        }
        // Mark purge before file removal. A crash leaves a durable tombstone, hidden and non-restorable.
        await tx.query("UPDATE family_media SET status='purging' WHERE deleted_at < now()-interval '30 days'")
      })
      await db.resourcesTransaction(async (tx) => {
        if (
          !(await tx.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock(638294017) AS locked'))
            .rows[0].locked
        ) {
          return
        }
        for (const row of (
          await tx.query<{ id: string }>("SELECT id FROM family_media WHERE status='purging' FOR UPDATE")
        ).rows) {
          await rm(await familyPath(row.id), { recursive: true, force: true })
          await tx.query('DELETE FROM family_media WHERE id=$1', [row.id])
        }
        // Receiving requests have a 10-minute deadline; only remove abandoned reservations after an hour.
        for (const row of (
          await tx.query<{ id: string }>(
            "SELECT id FROM family_uploads WHERE created_at < now()-interval '1 hour' FOR UPDATE",
          )
        ).rows) {
          await rm(await familyPath(row.id), { recursive: true, force: true })
          await tx.query('DELETE FROM family_uploads WHERE id=$1', [row.id])
        }
        // A crash after a filesystem write but before INSERT must not leak disk usage forever.
        for (const name of await readdir(await familyRoot())) {
          if (!/^[0-9a-f-]{36}$/.test(name)) continue
          const exists = (
            await tx.query(
              'SELECT 1 FROM family_media WHERE id=$1 UNION ALL SELECT 1 FROM family_uploads WHERE id=$1',
              [name],
            )
          ).rowCount
          if (!exists && (await stat(await familyPath(name))).mtimeMs < Date.now() - 3600_000) {
            await rm(await familyPath(name), { recursive: true, force: true })
          }
        }
        // Keep library independent of the lifetime of its uploader.
        await tx.query(
          'UPDATE family_media SET created_by=NULL WHERE created_by IN (SELECT username FROM deleted_usernames)',
        )
      })
    } finally {
      ticking = false
    }
  }
  return {
    access,
    requireAccess,
    item,
    tick,
    cancel,
    members: async (user: string) => {
      await requireAccess(user, true)
      return (
        await (
          await client()
        ).query<{ username: string; family_member: boolean }>(
          'SELECT username,family_member FROM user_accounts WHERE username NOT IN (SELECT username FROM deleted_usernames) ORDER BY username',
        )
      ).rows
    },
    membership: async (user: string, username: string, value: boolean) =>
      db.resourcesTransaction(async (tx) => {
        await requireAccess(user, true, tx)
        if (
          !(
            await tx.query(
              'UPDATE user_accounts SET family_member=$2 WHERE username=$1 AND username NOT IN (SELECT username FROM deleted_usernames)',
              [username, value],
            )
          ).rowCount
        ) {
          throw httpError(404, 'Account not found')
        }
      }),
    list: async (user: string, query: FamilyQuery) => {
      const role = await requireAccess(user)
      if (query.trash === 'true' && !role.is_admin) throw httpError(403, 'Administrator access required')
      const rows = (
        await (
          await client()
        ).query<MediaRow>(
          `SELECT * FROM family_media WHERE status<>'purging'
       AND ($1::boolean OR status='ready') AND (deleted_at IS NOT NULL)=$2 AND ($3::text IS NULL OR kind=$3)
       AND ($4::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM family_media WHERE id=$4))
       ORDER BY created_at DESC,id DESC LIMIT 41`,
          [role.is_admin, query.trash === 'true', query.kind ?? null, query.cursor ?? null],
        )
      ).rows
      return {
        success: true,
        items: rows.slice(0, 40).map(serialize),
        next_cursor: rows.length > 40 ? rows[39].id : null,
      }
    },
    reserve: async (user: string) => {
      const id = randomUUID()
      const reserve = familyMaxUpload() + familyMaxDerivative() + familyWorkspace()
      await db.resourcesTransaction(async (tx) => {
        await requireAccess(user, true, tx)
        await tx.query('SELECT pg_advisory_xact_lock(638294018)')
        const used = (
          await tx.query<{ bytes: string; receiving: string }>(`SELECT
          (COALESCE((SELECT sum(original_bytes+derivative_bytes+reserved_bytes) FROM family_media),0)+COALESCE((SELECT sum(reserved_bytes) FROM family_uploads),0))::text AS bytes,
          (SELECT count(*) FROM family_uploads)::text AS receiving`)
        ).rows[0]
        if (Number(used.receiving) >= 2) {
          throw httpError(429, 'Two uploads are already in progress. Please retry.')
        }
        if (Number(used.bytes) + reserve > familyLimit('FAMILY_QUOTA_BYTES', 50 * 1024 ** 3)) {
          throw httpError(507, 'Family media quota is full')
        }
        await familySpace(reserve + Number(used.receiving) * reserve)
        await tx.query('INSERT INTO family_uploads(id,reserved_bytes) VALUES($1,$2)', [id, reserve])
      })
      try {
        await mkdir(await familyPath(id), { mode: 0o700 })
      } catch (error) {
        await cancel(id)
        throw error
      }
      return id
    },
    finishUpload: async (user: string, id: string, filename: string, caption: string, declared: string) => {
      const path = await safeFamilyFile(id, 'original')
      const info = await sniffFamily(path)
      if (
        declared &&
        declared !== 'application/octet-stream' &&
        declared !== info.mime &&
        !(
          info.mime === 'image/heic' &&
          ['image/heif', 'image/heic-sequence', 'image/heif-sequence'].includes(declared)
        ) &&
        !(info.kind === 'video' && ['video/mp4', 'video/quicktime'].includes(declared))
      ) {
        throw httpError(415, 'The file contents do not match its media type')
      }
      if (info.kind === 'video') {
        try {
          await probeFamilyVideo(path)
        } catch {
          throw httpError(415, 'Unsupported or damaged video')
        }
      }
      const sha = await familyHash(path)
      const bytes = (await stat(path)).size
      if (!bytes || bytes > familyMaxUpload()) throw httpError(413, 'File exceeds upload limit')
      await syncFamilyFile(path)
      await syncFamilyFile(await familyPath(id))
      return db.resourcesTransaction(async (tx) => {
        await requireAccess(user, true, tx)
        await tx.query('SELECT pg_advisory_xact_lock(638294018)')
        if ((await tx.query('SELECT 1 FROM family_media WHERE sha256=$1', [sha])).rowCount) {
          throw httpError(409, 'This file is already in the family library, including trash')
        }
        const row = (
          await tx.query<MediaRow>(
            `INSERT INTO family_media(id,sha256,kind,mime_type,source_format,original_filename,original_bytes,reserved_bytes,caption,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [
              id,
              sha,
              info.kind,
              info.mime,
              info.format,
              familyFilename(filename),
              bytes,
              familyMaxDerivative() + familyWorkspace(),
              caption,
              user,
            ],
          )
        ).rows[0]
        await tx.query('DELETE FROM family_uploads WHERE id=$1', [id])
        return serialize(row)
      })
    },
    edit: async (user: string, id: string, edit: FamilyEdit) => {
      await requireAccess(user, true)
      await item(user, id)
      const row = (
        await (
          await client()
        ).query<MediaRow>(
          "UPDATE family_media SET caption=COALESCE($2,caption),captured_at=CASE WHEN $3 THEN $4 ELSE captured_at END WHERE id=$1 AND status<>'purging' RETURNING *",
          [id, edit.caption ?? null, edit.captured_at !== undefined, edit.captured_at ?? null],
        )
      ).rows[0]
      if (!row) throw httpError(404, 'Media not found')
      return serialize(row)
    },
    trash: async (user: string, id: string, restore = false) => {
      await requireAccess(user, true)
      await item(user, id)
      if (
        !(
          await (
            await client()
          ).query(
            `UPDATE family_media SET deleted_at=${restore ? 'NULL' : 'COALESCE(deleted_at,now())'} WHERE id=$1 AND status<>'purging' ${restore ? "AND deleted_at > now()-interval '30 days'" : ''}`,
            [id],
          )
        ).rowCount
      ) {
        throw httpError(409, 'The restoration window has expired')
      }
    },
    retry: async (user: string, id: string) =>
      db.resourcesTransaction(async (tx) => {
        await requireAccess(user, true, tx)
        await item(user, id, tx)
        await tx.query('SELECT pg_advisory_xact_lock(638294018)')
        const reserve = familyMaxDerivative() + familyWorkspace()
        const used = (
          await tx.query<{ bytes: string }>(
            `SELECT (COALESCE((SELECT sum(original_bytes+derivative_bytes+reserved_bytes) FROM family_media),0)+COALESCE((SELECT sum(reserved_bytes) FROM family_uploads),0))::text AS bytes`,
          )
        ).rows[0]
        if (Number(used.bytes) + reserve > familyLimit('FAMILY_QUOTA_BYTES', 50 * 1024 ** 3)) {
          throw httpError(507, 'Family media quota is full')
        }
        await familySpace(reserve)
        await tx.query(
          "UPDATE family_media SET status='queued',reserved_bytes=$2 WHERE id=$1 AND status='failed' AND deleted_at IS NULL",
          [id, reserve],
        )
      }),
  }
}
