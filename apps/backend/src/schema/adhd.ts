export const adhdTables: Record<string, string> = {
  adhd_form_scope: `ALTER TABLE check_in_forms ADD COLUMN IF NOT EXISTS owner_scope TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS adhd_form_name ON check_in_forms(name) WHERE owner_scope='adhd'`,
  adhd_settings: `CREATE TABLE IF NOT EXISTS adhd_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton), revision INTEGER NOT NULL DEFAULT 1,
    data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  adhd_records: `CREATE TABLE IF NOT EXISTS adhd_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kind TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, parent_id UUID REFERENCES adhd_records(id) ON DELETE CASCADE,
    data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE UNIQUE INDEX IF NOT EXISTS adhd_one_active ON adhd_records((data->>'status')) WHERE kind='protocol' AND data->>'status'='active';
    CREATE UNIQUE INDEX IF NOT EXISTS adhd_one_assignment_day ON adhd_records(parent_id,(data->>'local_date')) WHERE kind='opportunity' AND data ? 'condition';
    CREATE UNIQUE INDEX IF NOT EXISTS adhd_invitation_slot ON adhd_records((data->>'slot_key')) WHERE kind='invitation';
    CREATE UNIQUE INDEX IF NOT EXISTS adhd_reservation_day ON adhd_records(parent_id,(data->>'local_date')) WHERE kind='assignment';
    CREATE INDEX IF NOT EXISTS adhd_records_parent ON adhd_records(parent_id)`,
  adhd_observations: `CREATE TABLE IF NOT EXISTS adhd_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), revision INTEGER NOT NULL DEFAULT 1,
    answer_id UUID NOT NULL UNIQUE REFERENCES check_ins(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES adhd_records(id) ON DELETE CASCADE,
    metadata JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  adhd_canonical_outcomes: `UPDATE adhd_records SET data=jsonb_set(data,'{outcome}',(data->'outcome')-'strain'),revision=revision+1,updated_at=clock_timestamp() WHERE kind='opportunity' AND jsonb_typeof(data->'outcome')='object' AND (data->'outcome') ? 'strain'`,
  adhd_commands: `CREATE TABLE IF NOT EXISTS adhd_commands (
    request_id UUID PRIMARY KEY, operation TEXT NOT NULL, payload_hash TEXT NOT NULL,
    result_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
}
