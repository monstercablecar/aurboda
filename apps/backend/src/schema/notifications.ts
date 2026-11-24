/**
 * `type` is TEXT rather than an enum: deploys overlap, and a new notification
 * type must be raisable without DDL.
 */
export const notificationsTables: Record<string, string> = {
  notification_preferences: `
    CREATE TABLE IF NOT EXISTS notification_preferences (
      type       TEXT PRIMARY KEY,
      in_app     BOOLEAN NOT NULL DEFAULT true,
      push       BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,

  notifications: `
    CREATE TABLE IF NOT EXISTS notifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      link        TEXT,
      data        JSONB,
      dedupe_key  TEXT UNIQUE,
      in_app      BOOLEAN NOT NULL DEFAULT true,
      push        BOOLEAN NOT NULL DEFAULT true,
      read_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  notifications_actions: `
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]'
  `,
  notifications_live_events: `CREATE OR REPLACE FUNCTION notify_private_notification_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('timeline_updates',''); RETURN NULL; END $$; DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='notifications_live_events' AND tgrelid='notifications'::regclass) THEN CREATE TRIGGER notifications_live_events AFTER INSERT OR UPDATE OR DELETE ON notifications FOR EACH STATEMENT EXECUTE FUNCTION notify_private_notification_change(); END IF; END $$`,
  notification_delivery_state: `CREATE TABLE IF NOT EXISTS notification_delivery_state(singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),not_before TIMESTAMPTZ NOT NULL); INSERT INTO notification_delivery_state(singleton,not_before) VALUES(true,NOW()) ON CONFLICT DO NOTHING`,
  notification_browser_deliveries: `CREATE TABLE IF NOT EXISTS notification_browser_deliveries(notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,subscription_id UUID NOT NULL REFERENCES browser_push_subscriptions(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','expired')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(notification_id,subscription_id))`,
  notifications_indexes: `
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (created_at DESC) WHERE read_at IS NULL
  `,
}
