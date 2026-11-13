const stamps = `id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()), updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp())`
export const nativeTaskTables: Record<string, string> = {
  task_board_settings: `CREATE TABLE IF NOT EXISTS task_board_settings (id INTEGER PRIMARY KEY CHECK (id=1), columns JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()))`,
  task_projects: `CREATE TABLE IF NOT EXISTS task_projects (${stamps}, payload JSONB NOT NULL)`,
  task_items: `CREATE TABLE IF NOT EXISTS task_items (${stamps}, project_id UUID REFERENCES task_projects(id) ON DELETE RESTRICT, payload JSONB NOT NULL)`,
  task_items_indexes: `CREATE INDEX IF NOT EXISTS task_items_project_idx ON task_items(project_id);`,
}
