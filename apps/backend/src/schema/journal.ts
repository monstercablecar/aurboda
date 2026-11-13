/** Journal content and original attachment bytes stay inside the private user database. */
export const journalTables: Record<string, string> = {
  journal_settings: `CREATE TABLE IF NOT EXISTS journal_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id), areas_initialized BOOLEAN NOT NULL DEFAULT FALSE)`,
  journal_areas: `CREATE TABLE IF NOT EXISTS journal_areas (id UUID PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL, archived BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
  journal_entries: `CREATE TABLE IF NOT EXISTS journal_entries (id UUID PRIMARY KEY, area_id UUID REFERENCES journal_areas(id) ON DELETE SET NULL, payload JSONB NOT NULL, create_request JSONB NOT NULL, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
  journal_templates: `CREATE TABLE IF NOT EXISTS journal_templates (id UUID PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
  journal_revisions: `CREATE TABLE IF NOT EXISTS journal_revisions (id UUID PRIMARY KEY, entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL)`,
  journal_attachments: `CREATE TABLE IF NOT EXISTS journal_attachments (id UUID PRIMARY KEY, entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, filename TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size > 0 AND size <= 20971520), prompt_id TEXT, bytes BYTEA NOT NULL CHECK(octet_length(bytes)=size), created_at TIMESTAMPTZ NOT NULL)`,
  journal_indexes: `CREATE INDEX IF NOT EXISTS journal_entries_area ON journal_entries(area_id); CREATE INDEX IF NOT EXISTS journal_revisions_entry ON journal_revisions(entry_id,created_at DESC); CREATE INDEX IF NOT EXISTS journal_attachments_entry ON journal_attachments(entry_id)`,
}
