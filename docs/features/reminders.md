# Custom reminders

Settings → Notifications → **Add custom notification** creates a private reminder with a name, date, local time, timezone and repeat choice (once, daily, weekdays or weekly). Weekly uses the start date's weekday. An optional page path opens a page on the configured server. Reminders can be edited, paused, deleted and tested. These are private inbox notifications, never Feed posts or federated content.

The server schedules them in the saved timezone even when the browser is closed. It checks every minute, then the official Android app receives them through its existing notification poller. Android polling is normally every 15 minutes and the operating system may delay it further: these are not exact alarms. The app's notification permission, account notifications and the **Custom reminders → Push** switch must be enabled. The official app establishes a baseline on its first notification poll and displays at most eight new notifications per poll; an immediate first-use test or a large simultaneous batch is not guaranteed to appear on the phone. Open/sign in to the app first, let it establish polling, then send a test. No fork APK or native updater change is required. Settings reports when the server scheduler has not started; saving a reminder does not itself prove phone delivery.

A test queues an ordinary reminder notification; the response says whether one was stored, not whether the phone displayed it. Both in-app and push switches off suppress it. At most one test can be queued per account per minute, including after deleting a reminder. The name is visible in the notification, so choose discreet names for sensitive routines.

## Schedule rules

- Creation and edits select a future occurrence; they do not immediately deliver a time that already passed. An enabled one-time reminder must have a future date/time.
- Pausing removes the next scheduled occurrence. Re-enabling chooses a future one. Completed or expired one-time reminders are disabled.
- Daylight-saving gaps shift to the next compatible time; repeated times use the first occurrence and do not notify twice. Daily repeats follow local time rather than fixed 24-hour intervals.
- When the server returns after an outage, occurrences up to one hour late are delivered once. Older occurrences are skipped, and repeating reminders advance to their next future date. This avoids a backlog of old alerts.
- Editing/deleting serializes with delivery. Notifications already delivered to the inbox or phone are not recalled by changing the schedule.

## Calendar copy

The optional Google Calendar link offers a five-minute event for the **next occurrence**, for the user to review and save. It is an independent copy, not recurring calendar synchronization. Later reminder edits or deletion do not change calendar copies. Configured Aurboda ICS calendar sources are read-only imports; they do not grant calendar write access.

## API and storage

REST: `GET/POST /reminders`, `PATCH/DELETE /reminders/:id`, `POST /reminders/:id/test`. Matching MCP tools: `list_reminders`, `add_reminder`, `update_reminder`, `delete_reminder`, `test_reminder_notification`. The test tool is classified as a mutation for read-only accounts. Listing returns `scheduler_ready` and each reminder's `next_due_at`. At most 100 reminders are stored per account.

Schemas live in `packages/api-spec/src/schemas/reminders.ts`. Data lives in `custom_reminders` and the account-level test limiter in `custom_reminder_state` within each user's database, so account dump/restore includes both. These names avoid colliding with a future upstream implementation of issue #1753; this fork implementation is not a claim that the upstream issue shipped.

A separate pg-boss queue drives the scheduler. Per-user row locks, notification insertion and schedule advancement share one database transaction, using the existing notifier and preferences. Each occurrence has a stable deduplication key; failure rolls the transaction back for retry. Concurrent ticks skip already-locked rows, and one account's failure does not stop another. No real account records are required for verification.
