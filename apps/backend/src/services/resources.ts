import * as spec from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'

import type { Queryable } from '../db/pool.ts'

import { httpError } from '../http-error.ts'
import { getCentralDb, type CentralDb } from './central-db.ts'
import { removeResourceFile } from './resources-storage.ts'

const idCheck = (id: string) => {
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
    throw httpError(400, 'Invalid resource identifier')
  }
}
const serialize = <T>(row: Record<string, unknown>): T => {
  const { storage_key: _key, ...publicRow } = row
  return {
    ...publicRow,
    created_at: new Date(row.created_at as string | Date).toISOString(),
    updated_at: new Date(row.updated_at as string | Date).toISOString(),
    ...(row.file_size != null ? { file_size: Number(row.file_size) } : {}),
  } as T
}
export const createResourcesService = (db: CentralDb = getCentralDb()) => {
  const cleanup = async () => {
    const client = await db.resourcesClient()
    await client.query(
      "INSERT INTO resources_pending_deletions(storage_key) SELECT storage_key FROM resources_pending_uploads WHERE created_at < now() - interval '24 hours' ON CONFLICT DO NOTHING",
    )
    for (const { storage_key } of (
      await client.query<{ storage_key: string }>('SELECT storage_key FROM resources_pending_deletions')
    ).rows) {
      try {
        await removeResourceFile(storage_key)
        await client.query('DELETE FROM resources_pending_uploads WHERE storage_key=$1', [storage_key])
        await client.query('DELETE FROM resources_pending_deletions WHERE storage_key=$1', [storage_key])
      } catch (error) {
        console.error('Resources cleanup will retry', error)
      }
    }
  }
  const requireAdmin = async (user: string) => {
    if (!(await db.isAdmin(user))) throw httpError(403, 'Administrator access required')
  }
  const mutate = async <T>(user: string, action: (tx: Queryable) => Promise<T>) => {
    await requireAdmin(user)
    await cleanup()
    const result = await db.resourcesTransaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(742901356)')
      if (!(await tx.query('SELECT 1 FROM admins WHERE username=$1', [user])).rows.length) {
        throw httpError(403, 'Administrator access required')
      }
      return action(tx)
    })
    await cleanup().catch((error) => console.error('Resources cleanup deferred', error))
    return result
  }
  const parentCheck = async (tx: Queryable, parent?: string | null) => {
    if (parent) {
      idCheck(parent)
      if (!(await tx.query('SELECT id FROM resources_folders WHERE id=$1', [parent])).rows.length) {
        throw httpError(404, 'Folder not found')
      }
    }
  }
  const requireRow = async (tx: Queryable, table: string, id: string) => {
    idCheck(id)
    const row = (await tx.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0]
    if (!row) throw httpError(404, 'Resource not found')
    return row
  }
  const update = async (user: string, id: string, body: spec.UpdateResourceItemBody, folder: boolean) =>
    mutate(user, async (tx) => {
      const table = folder ? 'resources_folders' : 'resources_items'
      const current = await requireRow(tx, table, id)
      if (
        body.expected_updated_at &&
        new Date(current.updated_at).toISOString() !== body.expected_updated_at
      ) {
        throw httpError(409, 'This item changed. Reload before saving.')
      }
      await parentCheck(tx, body.parent_id)
      if (folder && body.parent_id) {
        const descendants = await tx.query(
          'WITH RECURSIVE tree AS (SELECT id FROM resources_folders WHERE id=$1 UNION ALL SELECT f.id FROM resources_folders f JOIN tree t ON f.parent_id=t.id) SELECT id FROM tree WHERE id=$2',
          [id, body.parent_id],
        )
        if (descendants.rows.length) {
          throw httpError(400, 'A folder cannot be moved into itself or its descendants')
        }
      }
      if (body.external_url && current.kind !== 'link') {
        throw httpError(400, 'Only links have an external URL')
      }
      const fields = Object.entries(body).filter(([key]) => key !== 'expected_updated_at')
      if (!fields.length) return current
      return (
        await tx.query(
          `UPDATE ${table} SET ${fields.map(([key], i) => `${key}=$${i + 2}`).join(',')},updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
          [id, ...fields.map(([, value]) => value)],
        )
      ).rows[0]
    })
  return {
    cleanup,
    reserveUpload: async (key: string) => {
      await (
        await db.resourcesClient()
      ).query('INSERT INTO resources_pending_uploads(storage_key) VALUES($1)', [key])
    },
    cancelUpload: async (key: string) => {
      const client = await db.resourcesClient()
      await client.query(
        'INSERT INTO resources_pending_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING',
        [key],
      )
      await cleanup()
    },
    requireAdmin,
    list: async (user: string): Promise<spec.ResourcesResponse> => {
      const tx = await db.resourcesClient()
      const folders = await tx.query('SELECT * FROM resources_folders ORDER BY title,id')
      const items = await tx.query('SELECT * FROM resources_items ORDER BY title,id')
      return {
        success: true,
        folders: folders.rows.map((r) => serialize<spec.ResourceFolder>(r)),
        resources: items.rows.map((r) => serialize<spec.ResourceItem>(r)),
        can_manage: await db.isAdmin(user),
      }
    },
    createFolder: async (user: string, input: spec.CreateResourceFolderBody) => {
      const body = spec.createResourceFolderBodySchema.parse(input)
      return serialize<spec.ResourceFolder>(
        await mutate(user, async (tx) => {
          await parentCheck(tx, body.parent_id)
          return (
            await tx.query('INSERT INTO resources_folders(id,title,parent_id) VALUES($1,$2,$3) RETURNING *', [
              randomUUID(),
              body.title,
              body.parent_id ?? null,
            ])
          ).rows[0]
        }),
      )
    },
    updateFolder: async (user: string, id: string, input: spec.UpdateResourceFolderBody) =>
      serialize<spec.ResourceFolder>(
        await update(user, id, spec.updateResourceFolderBodySchema.parse(input), true),
      ),
    updateItem: async (user: string, id: string, input: spec.UpdateResourceItemBody) =>
      serialize<spec.ResourceItem>(
        await update(user, id, spec.updateResourceItemBodySchema.parse(input), false),
      ),
    createLink: async (user: string, input: spec.CreateResourceLinkBody) => {
      const body = spec.createResourceLinkBodySchema.parse(input)
      return serialize<spec.ResourceItem>(
        await mutate(user, async (tx) => {
          await parentCheck(tx, body.parent_id)
          return (
            await tx.query(
              "INSERT INTO resources_items(id,title,kind,external_url,parent_id,description,created_by) VALUES($1,$2,'link',$3,$4,$5,$6) RETURNING *",
              [
                randomUUID(),
                body.title,
                body.external_url,
                body.parent_id ?? null,
                body.description ?? null,
                user,
              ],
            )
          ).rows[0]
        }),
      )
    },
    addFile: async (
      user: string,
      input: spec.ResourceUploadBody,
      file: { key: string; name: string; mime: string; size: number; kind: spec.ResourceKind },
    ) => {
      const body = spec.resourceUploadBodySchema.parse(input)
      return serialize<spec.ResourceItem>(
        await mutate(user, async (tx) => {
          await parentCheck(tx, body.parent_id)
          await tx.query('DELETE FROM resources_pending_uploads WHERE storage_key=$1', [file.key])
          return (
            await tx.query(
              'INSERT INTO resources_items(id,title,kind,original_filename,storage_key,mime_type,file_size,parent_id,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
              [
                randomUUID(),
                body.title,
                file.kind,
                file.name,
                file.key,
                file.mime,
                file.size,
                body.parent_id ?? null,
                body.description ?? null,
                user,
              ],
            )
          ).rows[0]
        }),
      )
    },
    getFile: async (id: string) => {
      const row = await requireRow(await db.resourcesClient(), 'resources_items', id)
      if (!row.storage_key) throw httpError(404, 'This resource has no file')
      return { item: serialize<spec.ResourceItem>(row), key: String(row.storage_key) }
    },
    deleteItem: async (user: string, id: string) =>
      mutate(user, async (tx) => {
        const row = await requireRow(tx, 'resources_items', id)
        if (row.storage_key) {
          await tx.query(
            'INSERT INTO resources_pending_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING',
            [row.storage_key],
          )
        }
        await tx.query('DELETE FROM resources_items WHERE id=$1', [id])
      }),
    deleteFolder: async (user: string, id: string, recursive = false) =>
      mutate(user, async (tx) => {
        await requireRow(tx, 'resources_folders', id)
        const children = await tx.query(
          'WITH RECURSIVE tree AS (SELECT id FROM resources_folders WHERE id=$1 UNION ALL SELECT f.id FROM resources_folders f JOIN tree t ON f.parent_id=t.id) SELECT id FROM tree',
          [id],
        )
        const ids = children.rows.map((r) => r.id)
        const items = await tx.query(
          'SELECT storage_key FROM resources_items WHERE parent_id=ANY($1::uuid[])',
          [ids],
        )
        if (!recursive && (ids.length > 1 || items.rows.length)) {
          throw httpError(409, 'Folder is not empty. Confirm recursive deletion to remove all contents.')
        }
        await tx.query(
          'INSERT INTO resources_pending_deletions(storage_key) SELECT storage_key FROM resources_items WHERE parent_id=ANY($1::uuid[]) AND storage_key IS NOT NULL ON CONFLICT DO NOTHING',
          [ids],
        )
        await tx.query('DELETE FROM resources_items WHERE parent_id=ANY($1::uuid[])', [ids])
        await tx.query('DELETE FROM resources_folders WHERE id=ANY($1::uuid[])', [ids])
      }),
  }
}
