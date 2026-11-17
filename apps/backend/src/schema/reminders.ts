export const reminderTables: Record<string, string> = {
  custom_reminder_state: `CREATE TABLE IF NOT EXISTS custom_reminder_state (singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton), last_test_at TIMESTAMPTZ)`,
  custom_reminders: `CREATE TABLE IF NOT EXISTS custom_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    time_of_day TEXT NOT NULL,
    timezone TEXT NOT NULL,
    recurrence TEXT NOT NULL,
    start_date TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    link TEXT,
    next_due_at TIMESTAMPTZ,
    last_test_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  custom_reminders_indexes: `CREATE INDEX IF NOT EXISTS idx_custom_reminders_due ON custom_reminders (next_due_at) WHERE enabled = true`,
}
