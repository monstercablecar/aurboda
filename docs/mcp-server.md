# MCP Server

Aurboda includes an MCP (Model Context Protocol) server that enables AI assistants like Claude to access all capabilities of the platform -- querying data, creating activities, managing rules, and more.

In practice: connect Claude (or another assistant that speaks MCP) to your account and ask about your data in plain language -- "did the evening runs help my sleep this month?", "log that I just had a coffee". On Claude.ai, add a custom connector with the URL `https://aurboda.net/mcp` (or `/mcp` on your own server) and sign in with your Aurboda account; see [Connecting Claude.ai](#oauth-21-for-claudeai-custom-connectors). Everything the MCP tools do is also in the REST API, documented interactively at [aurboda.net/apispec](https://aurboda.net/apispec) (`/apispec` on your own server).

## Overview

The MCP server exposes 200+ tools covering all of Aurboda's functionality. Tool descriptions, parameters, and schemas are self-documented via the MCP protocol itself -- AI assistants discover available tools automatically.

Key areas covered by MCP tools:

- **Querying** -- daily summaries, metrics, activities, tags, meals, reports, correlations, trends, chart data
- **Tracking** -- add/update/delete activities, tags, metrics, meals, comments
- **Activity types** -- manage custom activity type definitions
- **Deduction rules** -- create rules that auto-generate activities from data conditions
- **Screentime** -- manage category rules and recategorize
- **Sync** -- trigger data syncs from Garmin, Oura, Strava, Gravl, Last.fm, RescueTime, calendars
- **Settings** -- user preferences, HR zones, training load configuration
- **Export** -- `export_data_dump` links a download of your whole database as SQL ([data export](data-export.md))
- **Account** -- `delete_my_account` deletes your account for good; admins can `delete_user` ([deleting accounts](admin.md#deleting-accounts))

### Tool discovery

The `tools/list` answer is abbreviated to keep it small: each tool shows the first sentence of its description and its top-level parameters only, each with its type, enum, format and a one-line description. Nested objects and arrays appear as `object` or `array` (with the item type), without their inner fields. `describe_tools` returns the full description and the complete JSON input schema -- nested objects, enums, formats, examples -- for up to 20 tool names, and lists any names it does not know under `unknown`. The server's `initialize` instructions tell the assistant to call it before using a tool whose parameters are objects or arrays. It is the one MCP tool without a REST twin: it is protocol plumbing, and REST's equivalent is the OpenAPI document.

```json
{ "name": "describe_tools", "arguments": { "names": ["add_deduction_rule", "query_chart_data"] } }
```

### Sleep tools

| Tool               | What it does                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_latest_sleep` | "How did I sleep last night?" -- the most recent sleep ending within 36 hours: timing, score, stage timeline and minutes, resting HR and HRV against 30-day baselines, Body Battery at bedtime and wake-up |

### Chart data tools

| Tool               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `query_chart_data` | Bucketed counts, sums, means or maxima of an activity type, metric (including computed `hr_zone_<n>_sec`) or screentime category, the same as `GET /chart-data`. For an activity type with list items, `measure` (`e1rm`, `volume`, …) charts that measure per session, `filter_field`/`filter_value` (`sets.exercise` = `Bench Press`) narrows it to one exercise, and a `sets.exercise` breakdown gives a series per exercise. `tz` (IANA, e.g. `Europe/Stockholm`) makes daily, weekly and monthly buckets start at local midnight, local Monday and the local 1st, and hourly ones at the local hour; omitted, buckets are UTC. The web app sends the browser's zone |

### Dashboard tools

See [Dashboard](features/dashboard.md#period-dashboards).

| Tool                 | What it does                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_dashboard_data` | The data each widget renders, keyed by widget id, for the home dashboard or a shared one (`dashboard_id`), the same as `GET /dashboard/data` and `GET /shared-dashboards/:id/data`. A period dashboard answers its latest finished period unless `period` (`2026-10`, `2026-W44`, `2026`) is given, with each figure compared against the previous period |

### Top list and places tools

See [Media](media.md#querying), [Screentime categories](features/screentime-categories.md#top-apps) and [Places](features/places.md#places-summary).

| Tool                 | What it does                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `query_top_media`    | Plays over `start`..`end` grouped by artist, album or track (`by`): total plays, the distinct count and the `limit` most played; `source` (`lastfm` or `mpris`) counts one source only                                                                                               |
| `query_top_apps`     | Screen time over `start`..`end` per app: total hours, distinct apps and the `limit` most used, leaving out categories excluded from screen time                                                                                                                                      |
| `get_places_summary` | Where each night of `start`..`end` was spent (the place at 03:00 in `tz`, a phone at rest included): nights per named place, elsewhere and without data, at home (`home_location`, default `Home`) and away; distinct named places, visits to them and the five with the most nights |

### Activity session tools

See [Activity types -- sessions overview](features/activity-types.md#sessions-overview).

| Tool                         | What it does                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query_activity_sessions`    | Sessions of one type, each with length, avg/max HR, HR-zone seconds and a box-plot summary of its HR samples; with `group_by` (a categorical data field) also one group per value, to compare repeats or pick a session by length and effort                                                                    |
| `get_activity_records`       | The best value of each record measure (e1RM, max weight, longest hold, most reps) of a type, optionally one item value (`sets.exercise` = `Bench Press`), with the date, session and set that first reached it; `start` and `end` limit it to a range                                                           |
| `get_activity_type_summary`  | Roll-up of one type (descendants included) over `start`..`end`: session count, total duration, total distance, best pace and average speed where sessions carry distance, and for sleep the average and best night and average minutes per stage; `filter_field` + `filter_value` narrow it (also an item path) |
| `get_activity_neighbors`     | The previous and next activity of the same type, optionally only those sharing a data field value (`same_field`, e.g. `session_name`)                                                                                                                                                                           |
| `list_activity_field_values` | The values a data field (e.g. `session_name`) has taken across a type and its subtypes, most recently used first, with counts -- for reusing a value instead of spelling a new variant                                                                                                                          |
| `get_activity_item_history`  | One activity's list items grouped by an item value (`field=sets.exercise`): per value the items, their measures (volume, e1RM, max weight, set count, longest hold), the records set and the previous session with it, plus totals                                                                              |
| `merge_item_values`          | Merge one value of a categorical item path (`field=sets.exercise`) into another across a type and its subtypes; the source becomes an alias, so later writes carrying it are stored as the target                                                                                                               |
| `list_item_value_aliases`    | The aliases kept for an item path (`field=sets.exercise`)                                                                                                                                                                                                                                                       |
| `delete_item_value_alias`    | Delete an alias; the data the merge rewrote stays rewritten                                                                                                                                                                                                                                                     |

### Activity track tools

See [Routes and segments](features/routes-and-segments.md).

| Tool                       | What it does                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_activity_track`       | An activity's full-resolution GPS track: `lat`, `lon`, `alt` and `t` (seconds since the activity start) per point, with `length_m` and `point_count` |
| `backfill_activity_tracks` | Build missing tracks from stored raw records (Garmin details at full resolution, Strava polylines shape-only) and return the counts                  |

### Route tools

A route is a course run more than once, recognised from the tracks. See
[Routes and segments](features/routes-and-segments.md#phase-2-routes). `query_activities`
takes a `route_id` to list a route's activities. `query_activities` and
`query_activity_sessions` also take a `category` that keeps the runs carrying that run
category (`low_hr`, `intervals`, `long`, `tempo`, `hard`, or any rule's `output_category`);
see [run features and categories](features/routes-and-segments.md#phase-3-run-features-and-categories).

| Tool           | What it does                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `list_routes`  | Every route with its type, length, run count and latest run; filter by `activity_type` (with subtypes), order by `sort`                   |
| `get_route`    | One route with its line and its runs, newest first: elapsed seconds, average heart rate and pace (s/km) per run                           |
| `update_route` | Rename a route                                                                                                                            |
| `delete_route` | Delete a route; its runs are kept, stay attached to it and are not matched again                                                          |
| `merge_routes` | Move every run of `source_route_id` onto the route `id` and delete the source                                                             |
| `match_routes` | Match every tracked activity without a route (attach to a covering route, or pair two unrouted tracks into a new one); returns the counts |

### Comment tools

Comments (stored as "notes") hang off anything, or off a bare point in time, and
can be threaded one level deep. See [Comments](features/comments.md) for the data
model.

| Tool          | What it does                                                                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_note`    | Add a comment in one of three shapes: on an entity (`entity_type` + `entity_id`), a reply (`entity_type: "note"`, `entity_id` = the comment's id), or about a moment (`entity_type: "time"`, no `entity_id`, `start_time` required, `end_time` optional) |
| `get_notes`   | All comments on one entity, each with its thread nested in `replies` (oldest first)                                                                                                                                                                      |
| `query_notes` | Every comment anchored in a `from`/`to` time range -- threads nested, replies never listed separately                                                                                                                                                    |
| `update_note` | Change a comment's content; `start_time`/`end_time` only on a `time` comment, and moving one moves its whole thread                                                                                                                                      |
| `delete_note` | Delete a comment; deleting a thread root deletes its replies too                                                                                                                                                                                         |

## Endpoint

The MCP server is available at `/mcp` and uses the Streamable HTTP transport:

- `POST /mcp` - Handle JSON-RPC requests
- `GET /mcp` - HTTP 405 (no SSE subscription support)
- `DELETE /mcp` - HTTP 405 (no persistent sessions)

Request bodies are limited to 4 MB; a larger body gets HTTP 413 with a JSON-RPC `-32600` error.

## Authentication

The MCP server supports two authentication methods:

### OAuth 2.1 (for Claude.ai Custom Connectors)

The server implements OAuth 2.1 with PKCE (S256) for clients that support it, such as Claude.ai custom connectors.

**Discovery:** `GET /.well-known/oauth-authorization-server` returns the authorization server metadata.

**OAuth endpoints:**

| Endpoint     | Method | Description                                                                    |
| ------------ | ------ | ------------------------------------------------------------------------------ |
| `/register`  | POST   | Dynamic client registration (RFC 7591)                                         |
| `/authorize` | GET    | Serves login form with OAuth params                                            |
| `/authorize` | POST   | Handles login + redirects with auth code                                       |
| `/token`     | POST   | Exchanges auth code or refresh token                                           |
| `/revoke`    | POST   | Revoke the connection proven by an access/refresh token and matching client ID |

**Supported grants:** `authorization_code` (with PKCE S256), `refresh_token`

**Token lifetimes:** Access tokens expire after 1 hour, refresh tokens after 30 days.

**Connecting Claude.ai:**

1. In Claude.ai, add a custom connector with the MCP URL: `https://aurboda.net/mcp`
2. Claude.ai will auto-discover the OAuth endpoints via `/.well-known/oauth-authorization-server`
3. On first use, you will be redirected to sign in with your Aurboda credentials and choose read-only analysis or explicitly allow changes
4. Claude.ai handles token refresh automatically

### Bearer Token (for Claude Desktop / API clients)

For direct API access, use the existing AES-256-GCM Bearer token:

1. Obtain a token via `POST /api/login`
2. Include the token in the `Authorization` header: `Authorization: Bearer <token>`

Both authentication methods are supported simultaneously. The MCP router is stateless: every request authenticates again and constructs its tools bound to that username. User IDs in tool arguments do not choose another database. There are no MCP resources or subscriptions; data is exposed through tools and `describe_tools` discovery.

### Analysis consent, permissions and revocation

New OAuth authorizations default to `read`. The authorization form explains private-data analysis and the external provider boundary, with an unchecked **Also allow changes (read and write)** option. Selecting it produces `read write`. The returned token response includes the granted scope; requesting a scope string alone cannot enable writing without the form selection. Refresh rotation preserves the original grant. Unknown stored scope values fail authentication.

Read-only analysis exposes an explicit reviewed set of tools in
[`mcp/connector-permissions.ts`](../apps/backend/src/mcp/connector-permissions.ts). Tools outside that set are disabled in both `tools/list` and `describe_tools`, and cannot be called by guessing their names. This excludes editing/deletion, explicit synchronization, admin tools, raw/debug logs, credential-bearing settings and full database export. Automatic query-time provider synchronization is also omitted for read-only connectors. Reading can still populate derived internal caches and usage counts; it does not grant content editing or deletion. This connector permission is independent of the plan-expiry gate: that gate's export/account-deletion exceptions do not authorize a read-only connector to use those tools.

**Existing grants need attention:** pre-scope OAuth rows have a null scope and retain their previous full access for compatibility. Revoke and reconnect them for read-only analysis. AES bearer tokens also retain full account access; they are not individually revocable and have no built-in expiry. Logging out locally does not invalidate an already copied AES token. Deleting an account blocks its tokens; rotating the server session secret invalidates all AES tokens, not only one client's.

OAuth access/refresh token records are stored in the central database and checked on every MCP request (`services/central-db.ts:getOAuthToken`, `services/oauth.ts:validateAccessIdentity`). Expired/revoked access tokens fail with HTTP 401. `/revoke` accepts form fields `token` and `client_id`; possession of a matching valid connection token authorizes revocation of all that username/client's tokens and pending codes. Unknown or mismatched credentials also receive HTTP 200, without changing another connection.

Account owners can independently list/revoke connections with their normal browser bearer token:

- `GET /api/oauth/connections` returns only that account's active client names, IDs and scopes.
- `POST /api/oauth/connections/revoke` with `{ "client_id": "…" }` revokes only that account's selected client. The strict body rejects a target username. Deleted accounts are refused. The backend paths omit the reverse proxy's `/api` prefix.

These credential-management routes deliberately require the browser AES token and are not exposed as analysis tools. There is no new administration or impersonation surface. Exchange, refresh and revocation serialize under a transaction-scoped PostgreSQL advisory lock so an in-flight refresh cannot reissue live tokens after revocation completes. Revocation affects subsequent requests; it cannot recall results already retrieved or stop a request that already passed authentication. Old backend versions do not enforce the new scope fields; do not leave old and new readers serving traffic when relying on read-only scope enforcement.

The server instructions mark retrieved text and attachments as untrusted user content, never authorization or tool-policy instructions. This does not make arbitrary AI clients immune to prompt injection; clients must continue to respect their own tool and data-handling boundaries.

### Journal readers and original media

The Journal feature uses its existing private per-user tables and shared service, not the generic `notes` model or a parallel MCP server. The read-only analysis allowlist includes the audited readers below. The same explicit read consent covers journals; the authorization form names this private-content category.

| MCP tool                   | REST counterpart                           | Data available                                                                                      |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `get_journal_capabilities` | `GET /api/journal/capabilities`            | Available filters, pagination and original-media limits; no private bodies                          |
| `get_journal_catalog`      | `GET /api/journal/catalog`                 | Sourced current workbook definitions                                                                |
| `list_journal_entries`     | `GET /api/journal/entries`                 | Complete entries plus total; search and filters                                                     |
| `get_journal_entry`        | `GET /api/journal/entries/:id`             | Markdown, metadata, links and complete workbook attempt                                             |
| `list_journal_areas`       | `GET /api/journal/areas`                   | Private areas; first listing initializes the existing default areas                                 |
| `list_journal_templates`   | `GET /api/journal/templates`               | Personal Markdown templates                                                                         |
| `list_journal_revisions`   | `GET /api/journal/entries/:id/revisions`   | Up to the newest 100 retained entry snapshots                                                       |
| `list_journal_attachments` | `GET /api/journal/entries/:id/attachments` | Original filename, MIME type, size, prompt link and timestamp                                       |
| `get_journal_attachment`   | `GET /api/journal/attachments/:id`         | Original private bytes; MCP base64 up to 1 MiB, REST binary up to the existing 20 MiB storage limit |

List/search filters are `search`, `from`/`to` (inclusive entry `occurred_at` instants), `area_id` (UUID or `general`), `tag`, `favorite`, `kind`, `workbook_id`, and `deleted`. Pagination starts at `page=1`, defaults to `per_page=30`, and is capped at 100. Search includes workbook answers, title, content and tags within the authenticated account. `workbook_id` matches the stored immutable definition ID. Trash is excluded by default; use `deleted="true"` to list trashed entries.

Each workbook attempt is an entry whose `workbook` contains answers, completed sections, current section and status plus an immutable `definition` snapshot. The snapshot includes its ID/version, prompt IDs/text, section introductions and source attribution. Read that saved definition to interpret answers; the current catalog may have changed. No separate answer database or client-supplied replacement definition was added.

Journal service calls always receive the authenticated username selected by the MCP router; supplying another username in tool arguments cannot select another account. Entry IDs, revision IDs and attachment IDs resolve inside that user's database. Read-only permission does not expose Journal create/update/delete or attachment upload/delete tools. OAuth revocation is checked again on subsequent MCP and Journal REST reads.

For media larger than 1 MiB, use the existing REST binary download with the **same OAuth read bearer token**, not an expiring public URL or a more privileged account credential. Journal REST GET routes accept scoped OAuth authorization; REST mutations retain their existing account-token authentication. No public journal attachment URL is issued. REST sends a complete original file and does not implement byte-range downloads. Metadata and original bytes remain available separately, and oversized MCP responses fail with a clear REST-download instruction rather than silently truncating the file.

An attachment being retrievable means an authorized client can obtain its original bytes. It does not mean every AI client accepts that audio format, downloads binary media, transcribes it, or interprets it. This work adds no transcription and no hosted AI dependency. Journal text, workbook answers and media are untrusted user content, not instructions that override authorization or tool policy.

Focused synthetic MCP tests cover discovery, filters/pagination, full immutable workbook context, owner binding for two ordinary users and an administrator, cross-account read/write/delete/media attempts, original-byte retrieval, oversized media, read-only mutation refusal and revoked grants. These mocked HTTP tests verify the routing/authorization contract; PostgreSQL integration/round-trip verification is recorded separately and must not be inferred from them.

## Available Metrics

The following metrics are available for querying and manual entry:

| Metric                     | Unit        | Description                    |
| -------------------------- | ----------- | ------------------------------ |
| `heart_rate`               | bpm         | Heart rate in beats per minute |
| `resting_heart_rate`       | bpm         | Resting heart rate             |
| `hrv_rmssd`                | ms          | Heart rate variability (RMSSD) |
| `weight`                   | kg          | Body weight                    |
| `body_fat`                 | percent     | Body fat percentage            |
| `bone_mass`                | kg          | Bone mass                      |
| `lean_body_mass`           | kg          | Lean body mass                 |
| `body_water_mass`          | kg          | Body water mass                |
| `height`                   | m           | Height in meters               |
| `steps`                    | count       | Step count                     |
| `distance`                 | m           | Distance traveled              |
| `floors_climbed`           | count       | Floors climbed                 |
| `calories_active`          | kcal        | Active calories burned         |
| `calories_total`           | kcal        | Total calories burned          |
| `calories_basal`           | kcal        | Basal metabolic calories       |
| `spo2`                     | percent     | Blood oxygen saturation        |
| `respiratory_rate`         | breaths/min | Respiratory rate               |
| `body_temperature`         | celsius     | Body temperature               |
| `basal_body_temperature`   | celsius     | Basal body temperature         |
| `blood_glucose`            | mmol/L      | Blood glucose level            |
| `blood_pressure_systolic`  | mmHg        | Systolic blood pressure        |
| `blood_pressure_diastolic` | mmHg        | Diastolic blood pressure       |
| `vo2_max`                  | mL/kg/min   | VO2 max                        |
| `readiness_score`          | score       | Readiness score (0-100)        |
| `resilience_score`         | score       | Resilience score (0-100)       |
| `productivity_score`       | score       | Productivity score (0-100)     |

## Connecting with Claude Desktop

To connect Claude Desktop to your Aurboda MCP server:

1. Start the Aurboda backend server
2. Obtain an authentication token via the login endpoint
3. Configure Claude Desktop with the MCP server URL and Bearer token

Example Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "aurboda": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <your-token-here>"
      }
    }
  }
}
```

## Example Conversations

Once connected, you can ask Claude questions like:

- "What was my heart rate yesterday?"
- "Show me a summary of my health data for January 15th"
- "How many steps did I take last week?"
- "Log that I just had a coffee"
- "Record my weight as 75.5 kg"
- "I meditated for 30 minutes starting at 2pm - add that as a tag"
- "Note that I felt dizzy around 11:40 this morning"
- "What did I comment on yesterday?"

## Input conventions

String values are trimmed of leading and trailing whitespace before validation, in MCP tool arguments as
well as in REST request bodies and query strings, at any depth (inside `data` records and arrays too).
Whitespace inside a value is kept, and a value that is only whitespace becomes empty, so a required field
still rejects it. Phone keyboards append a space after an autocompleted word: `"yoga "` reaches the tool
as `"yoga"`.

These keys keep their value exactly as sent, wherever they appear: passwords (`password`,
`current_password`, `new_password`), regular expressions and patterns (`pattern`, `regex`, `rule_regex`,
`strip_pattern`, `message_pattern`, `outcome_pattern`), markdown (`content`, `markdown`) and the WebAuthn
`response_json`.

## Error Handling

The MCP server returns standard JSON-RPC error responses:

- Invalid metric names will list all valid metrics in the error message
- Invalid date formats will prompt for ISO 8601 format
- Authentication errors return HTTP 401
- Session mismatch errors return HTTP 403
