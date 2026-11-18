export const treatmentCheckinTables: Record<string, string> = {
  treatment_type_checkin_plan: `ALTER TABLE treatment_types ADD COLUMN IF NOT EXISTS default_checkin_plan JSONB`,
  treatment_checkin_plans: `CREATE TABLE IF NOT EXISTS treatment_checkin_plans (
    treatment_session_id UUID PRIMARY KEY REFERENCES treatment_sessions(id) ON DELETE RESTRICT,
    settings JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  treatment_checkins: `CREATE TABLE IF NOT EXISTS treatment_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_session_id UUID NOT NULL REFERENCES treatment_sessions(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL,
    offset_hours INTEGER,
    window_hours INTEGER,
    template_snapshot JSONB,
    due_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    next_reminder_at TIMESTAMPTZ,
    reminder_count INTEGER NOT NULL DEFAULT 0 CHECK (reminder_count BETWEEN 0 AND 2),
    snoozed_until TIMESTAMPTZ,
    skipped_at TIMESTAMPTZ,
    draft JSONB NOT NULL DEFAULT '{}'::jsonb,
    draft_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
    observed_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 0,
    assessment_id UUID UNIQUE REFERENCES assessments(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  treatment_checkins_indexes: `CREATE INDEX IF NOT EXISTS idx_treatment_checkins_session ON treatment_checkins(treatment_session_id);
    CREATE INDEX IF NOT EXISTS idx_treatment_checkins_reminders ON treatment_checkins(next_reminder_at) WHERE assessment_id IS NULL AND skipped_at IS NULL`,
}
