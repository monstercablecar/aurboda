import type { FamilyAccess, FamilyFolder, FamilyMove } from '@aurboda/api-spec'

import { randomUUID } from 'node:crypto'

import type { Queryable } from '../db/pool.ts'
import type { CentralDb } from './central-db.ts'

import { httpError } from '../http-error.ts'
import { familyId } from './family-storage.ts'

type Access = (user: string, admin?: boolean, tx?: Queryable) => Promise<FamilyAccess>
export async function requireFamilyFolder(tx: Queryable, id: string | null) {
  if (id && !(await tx.query('SELECT 1 FROM family_folders WHERE id=$1 FOR KEY SHARE', [id])).rowCount) {
    throw httpError(404, 'Folder not found')
  }
}
const conflict = (error: unknown): never => {
  if ((error as { code?: string }).code === '23505') {
    throw httpError(409, 'A folder with that name already exists')
  }
  throw error
}
export function createFamilyFolders(
  db: Pick<CentralDb, 'resourcesClient' | 'resourcesTransaction'>,
  access: Access,
) {
  return {
    list: async (user: string): Promise<FamilyFolder[]> => {
      const role = await access(user)
      return (
        await (
          await db.resourcesClient()
        ).query<FamilyFolder>(
          `SELECT f.id,f.name,count(m.id)::integer AS count FROM family_folders f LEFT JOIN family_media m ON m.album_id=f.id AND m.deleted_at IS NULL AND m.status<>'purging' AND ($1::boolean OR m.status='ready' OR m.created_by=$2) GROUP BY f.id ORDER BY lower(f.name),f.id`,
          [role.is_admin, user],
        )
      ).rows
    },
    create: async (user: string, name: string) => {
      try {
        return await db.resourcesTransaction(async (tx) => {
          await access(user, true, tx)
          await tx.query('SELECT pg_advisory_xact_lock(638294019)')
          if (
            Number(
              (await tx.query<{ count: string }>('SELECT count(*) FROM family_folders')).rows[0].count,
            ) >= 200
          ) {
            throw httpError(409, 'The album can have up to 200 folders')
          }
          return (
            await tx.query<FamilyFolder>(
              'INSERT INTO family_folders(id,name) VALUES($1,$2) RETURNING id,name,0::integer AS count',
              [randomUUID(), name],
            )
          ).rows[0]
        })
      } catch (error) {
        return conflict(error)
      }
    },
    rename: async (user: string, id: string, name: string) => {
      try {
        await db.resourcesTransaction(async (tx) => {
          await access(user, true, tx)
          if (
            !(await tx.query('UPDATE family_folders SET name=$2 WHERE id=$1', [familyId(id), name])).rowCount
          ) {
            throw httpError(404, 'Folder not found')
          }
        })
      } catch (error) {
        conflict(error)
      }
    },
    remove: async (user: string, id: string) =>
      db.resourcesTransaction(async (tx) => {
        await access(user, true, tx)
        // The foreign key unfiles memories atomically; their metadata and files remain intact.
        if (!(await tx.query('DELETE FROM family_folders WHERE id=$1', [familyId(id)])).rowCount) {
          throw httpError(404, 'Folder not found')
        }
      }),
    move: async (user: string, move: FamilyMove) =>
      db.resourcesTransaction(async (tx) => {
        await access(user, true, tx)
        // Folder first, then media locks: use the same order as ON DELETE SET NULL.
        await requireFamilyFolder(tx, move.album_id)
        const rows = await tx.query(
          "SELECT id FROM family_media WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL AND status<>'purging' ORDER BY id FOR UPDATE",
          [move.ids],
        )
        if (rows.rowCount !== move.ids.length) {
          throw httpError(404, 'One or more memories are no longer available')
        }
        await tx.query('UPDATE family_media SET album_id=$2 WHERE id=ANY($1::uuid[])', [
          move.ids,
          move.album_id,
        ])
      }),
  }
}
