import type { CentralDbDeps } from './central-db.ts'
export const CREATE_RESOURCES_TABLES = `
CREATE TABLE IF NOT EXISTS resources_folders (
 id UUID PRIMARY KEY, title TEXT NOT NULL, parent_id UUID REFERENCES resources_folders(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS resources_items (
 id UUID PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, original_filename TEXT,
 external_url TEXT, storage_key UUID UNIQUE, mime_type TEXT, file_size BIGINT,
 parent_id UUID REFERENCES resources_folders(id), description TEXT, created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS resources_pending_deletions (storage_key UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS resources_pending_uploads (storage_key UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS resources_items_parent ON resources_items(parent_id);
CREATE INDEX IF NOT EXISTS resources_folders_parent ON resources_folders(parent_id);
`
export const createCentralResourcesApi = (deps: CentralDbDeps) => ({
  resourcesClient: deps.getClient,
  resourcesTransaction: deps.withTransaction,
})
export type CentralResourcesApi = ReturnType<typeof createCentralResourcesApi>
