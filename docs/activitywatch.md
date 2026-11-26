# ActivityWatch

ActivityWatch collects app usage locally. Aurboda's Android companion and desktop push agent **read** its local API and upload events to your authenticated Aurboda account. The server cannot contact your phone's localhost. Original ActivityWatch events are never edited or deleted.

## Android setup

1. Install and open ActivityWatch for Android. Verify that its app-usage screen contains events and that ActivityWatch has Usage Access.
2. In ActivityWatch **Settings → API authentication**, copy its API key. Keep authentication enabled.
3. In Aurboda **Sync → ActivityWatch**, save that key, enable synchronization for the signed-in account, and press **Sync Now**.
4. Watch the confirmed event count and earliest/latest timestamps. The web Data Sources page shows stored events per device. Use the activity timeline and screen-time charts to inspect them.

The ActivityWatch key is different from the Aurboda login token. It is encrypted on the phone, excluded from backup/transfer, and sent only to `127.0.0.1:5600`. The Aurboda token goes only to your Aurboda server. Redirects are rejected for these import requests. A local 401 does not log you out of Aurboda.

The repair requires enabling the account-specific toggle again; the old global opt-in/checkpoints are not inherited across accounts. Android cannot read another app's private key automatically. Do not paste the key into chat or expose ActivityWatch to your network.

### Connection and progress

The native section shows connection evidence, last attempted and successful pass, server-confirmed unique observation count, earliest/latest imported timestamps, resumable historical progress, diagnostics and remediation, **Sync Now**, **Retry**, and **Import all history again**. A toggle alone never means connected. A successful pass can still have historical work pending; the progress label distinguishes that state.

Manual Health Connect Sync Now also queues ActivityWatch. ActivityWatch has its own WorkManager job so Health Connect permissions, failures and early returns cannot prevent it from running. Enabling it schedules an immediate job and a 15-minute periodic job, with network constraints and exponential retry backoff. Android controls actual timing. WorkManager persists jobs across restarts/reboots; both apps must be allowed background battery use, and the local ActivityWatch server must be running.

If ActivityWatch is unreachable, open it and retry. A key-required/rejected error directs you to its authentication settings. An unsupported endpoint or malformed event stops the current page without advancing its checkpoint. Authentication and read-only Aurboda refusals require user action, while transient connectivity/server failures retry automatically.

## History and incremental imports

Initial synchronization imports **all available app-usage history**, with no one-hour/500-event cutoff. Each bounded pass handles recent events first, then continues the historical frontier. Both scans resume after interruption. Uploads contain at most 500 events. A checkpoint advances only after every event in that page has a valid complete server acknowledgment.

ActivityWatch's event API is newest-first, has no offset pagination, and clips intervals at time bounds. The importer leaves timestamp-tied events together, increases the read size for ties, and retrieves original events by ID whenever an end bound may have clipped them. An exceptionally large tie group stops with an error rather than silently skipping events. Current ActivityWatch releases support the single-event endpoint; older incompatible versions must be upgraded.

Recent scans overlap the last acknowledged frontier by a day, updating ongoing heartbeats without duplicate rows. Arbitrary edits or newly inserted records older than that overlap require **Import all history again** (desktop: `AW_BACKFILL=1`). This resets only Aurboda's traversal state. Source bucket creation time scopes event identities so a recreated bucket cannot overwrite the previous bucket's observations.

## Desktop setup

On the computer running ActivityWatch, open **Data Sources → ActivityWatch (Desktop)** in Aurboda and use its installation command. The existing Linux/macOS timer/cron/launch-agent and Windows scheduled task run every five minutes. Re-run the installer to update the agent. Linux/macOS require Python 3.9+ and curl; Windows now requires Python 3.9+ with `python` on PATH. Both installers embed the same standard-library Python import engine.

If local API authentication is enabled, add `AW_API_KEY` to the protected Linux/macOS settings file `~/.config/aw-aurboda/env`; on Windows add `aw_api_key` to `%LOCALAPPDATA%\aw-aurboda\config.json`. Never use an Aurboda token as the local key. Keep settings private to your OS account. ActivityWatch authentication is optional on desktop; a blank local key supports existing unauthenticated loopback servers.

To reconcile all history manually on Linux/macOS:

```bash
AW_BACKFILL=1 ~/.local/bin/aw-to-aurboda.sh
```

On Windows, set `$env:AW_BACKFILL='1'`, run the installed `aw-to-aurboda.ps1`, then remove that environment variable. The history cursor resumes on subsequent scheduled runs. State is separate for each Aurboda destination/credential, source bucket and bucket creation time. Refreshing a desktop API token safely starts a new idempotent backfill.

All app buckets are discovered; each uses its ActivityWatch hostname, rather than assigning another synchronized device's events to the local machine. AFK buckets are matched to that hostname. Fully AFK-contained observations remain in raw storage with an AFK flag but do not contribute to screen time. A failed or truncated AFK lookup stops the import rather than inflating totals.

## Storage, classification and multiple devices

The owner-local `activitywatch_observations` table retains device hostname, bucket ID/creation instance, event ID, original timestamp text, fractional duration, app name, original JSON data (including source categories), mobile/AFK flags, and receipt time. Its compound source identity makes retries idempotent; an existing event's changed duration/data updates that observation. Nothing is shared with other accounts or sent to classification models.

The existing productivity table remains a dashboard projection. Colliding same-app/start/device observations choose the longest observation deterministically; the granular originals remain available. Source corrections retract obsolete managed projections without reviving user-deleted records. Derived activities rebuild from persisted projections so page size/order does not create duplicate spans.

Combined screen-time totals use interval unions, clipped to requested bounds. Simultaneous categories receive deterministic alphabetical category precedence (uncategorized last), not a claim about which device held the user's attention. Raw per-device observations remain distinct. Existing rounded productivity durations are retained for compatibility; exact source duration/timestamp remain in observations. Future timestamp-based contextual classification can operate on these originals independently of today's categories.

## Status API

- `POST /api/sync/activitywatch`: authenticated batched ingestion. A database/processing failure returns failure; clients must check both HTTP and result status/count.
- `GET /api/sync/activitywatch/status`: sync states and persisted per-device coverage, including older history.
- MCP `get_sync_status(provider="activitywatch")`: includes `activitywatch_devices` alongside sync states.

“Data received” proves persistence, not a continuously reachable phone. Server status cannot know about a local connection attempt that never reached it. Detailed attempt errors and historical cursors live on the importing device.

## Verification boundary

Automated tests use synthetic app data, an isolated PostgreSQL database, Android HTTP mocks/Robolectric, and local desktop HTTP servers. They do not prove your physical phone's ActivityWatch server availability, installed version, battery policy, key entry, or APK signing compatibility. Verify a real import by checking the source hostname, event count and historical date range, then opening the activity timeline/chart. Preserve both apps' data during installation; never uninstall ActivityWatch to troubleshoot sync.
