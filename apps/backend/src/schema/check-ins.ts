export const checkInsTables: Record<string, string> = {
  check_in_form_versions: `
    CREATE TABLE IF NOT EXISTS check_in_form_versions (
      form_id    UUID NOT NULL REFERENCES check_in_forms(id) ON DELETE CASCADE,
      version    INTEGER NOT NULL,
      questions  JSONB NOT NULL,
      score      JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (form_id, version)
    )
  `,
  check_in_forms: `
    CREATE TABLE IF NOT EXISTS check_in_forms (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                TEXT NOT NULL,
      description         TEXT,
      version             INTEGER NOT NULL DEFAULT 1,
      questions           JSONB NOT NULL,
      score               JSONB,
      schedule            JSONB,
      schedule_not_before TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      outputs_enabled     BOOLEAN NOT NULL DEFAULT false,
      notify              BOOLEAN NOT NULL DEFAULT true,
      archived            BOOLEAN NOT NULL DEFAULT false,
      deleted_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  check_ins: `
    CREATE TABLE IF NOT EXISTS check_ins (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id       UUID NOT NULL REFERENCES check_in_forms(id) ON DELETE CASCADE,
      form_version  INTEGER NOT NULL,
      outputs_enabled BOOLEAN NOT NULL DEFAULT false,
      status        TEXT NOT NULL DEFAULT 'answered',
      answered_at   TIMESTAMPTZ NOT NULL,
      scheduled_for TIMESTAMPTZ,
      answers       JSONB NOT NULL DEFAULT '{}',
      logged        JSONB NOT NULL DEFAULT '{}',
      activity_ids  JSONB NOT NULL DEFAULT '{}',
      entity_type   TEXT,
      entity_id     TEXT,
      note          TEXT,
      deleted_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  check_in_metric_outputs: `CREATE TABLE IF NOT EXISTS check_in_metric_outputs(owner_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,metric TEXT NOT NULL,time TIMESTAMPTZ NOT NULL,value DOUBLE PRECISION NOT NULL,written_at TIMESTAMPTZ,PRIMARY KEY(metric,time))`,
  check_in_activity_outputs: `CREATE TABLE IF NOT EXISTS check_in_activity_outputs(owner_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,activity_id UUID PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,written_at TIMESTAMPTZ)`,
  check_in_requests: `CREATE TABLE IF NOT EXISTS check_in_requests(id UUID PRIMARY KEY,request JSONB NOT NULL,response_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED)`,
  check_ins_indexes: `
    CREATE INDEX IF NOT EXISTS idx_check_ins_answered ON check_ins (answered_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_check_ins_form_answered ON check_ins (form_id, answered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_check_ins_entity ON check_ins (entity_type, entity_id) WHERE entity_id IS NOT NULL
  `,
}
