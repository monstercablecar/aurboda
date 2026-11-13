/** Private data never enters globally shareable custom metrics or time_series. */
export const peopleTables: Record<string, string> = {
  people: `CREATE TABLE IF NOT EXISTS people (id UUID PRIMARY KEY, profile JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  people_events: `CREATE TABLE IF NOT EXISTS people_events (id UUID PRIMARY KEY, person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE, actor TEXT NOT NULL, event JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revision INTEGER NOT NULL DEFAULT 1)`,
  people_reminder_deliveries: `CREATE TABLE IF NOT EXISTS people_reminder_deliveries (
    event_id UUID NOT NULL REFERENCES people_events(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    reminder_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('accepted','unavailable','retry','expired')),
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(event_id,revision)
  )`,
  people_events_indexes: `CREATE INDEX IF NOT EXISTS people_events_person ON people_events(person_id)`,
  people_feedback: `CREATE TABLE IF NOT EXISTS people_feedback (person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE, guidance_id TEXT NOT NULL, version TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('dismissed','completed')), recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(person_id,guidance_id))`,
  people_metric_points: `CREATE TABLE IF NOT EXISTS people_metric_points (person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE, metric TEXT NOT NULL, time TIMESTAMPTZ NOT NULL, value DOUBLE PRECISION NOT NULL, unit TEXT NOT NULL, PRIMARY KEY(person_id,metric,time))`,
}
