# Exporting your account data

Your data is yours to take with you. One click in Settings downloads your saved private account database
in a single file, which can be restored into a compatible Aurboda server, including one you run
yourself ([Docker setup](docker.md)). It works on every plan, also after a free trial has ended and
the account has turned read-only ([plans and billing](admin.md#plans-and-billing)). To leave for good,
**Settings → Delete account** deletes the account and drops your whole database with it
([deleting accounts](admin.md#deleting-accounts)); export first if you want to keep a copy.

Every Aurboda user has their own PostgreSQL database (`aurboda_<username>`). **Settings → Export account
data → Download export** gives you a complete copy of it as a gzipped plain SQL dump,
`aurboda-<username>-<YYYY-MM-DD>.sql.gz`, made with `pg_dump`. It is the full-fidelity export: every
metric, activity, location, meal, note, setting, rule and feed post — and every picture you added to what
you wrote, which lives in your database too (`feed_image`) — in a form you can restore into your
own Aurboda installation (to move servers) or simply read and query with standard PostgreSQL tools.

The dump is plain SQL (`CREATE TABLE …`, `COPY … FROM stdin`), so `gunzip -c` shows exactly what it holds.
After `pg_dump`'s own output it carries one more table, `exported_shared_food_items`: the food items
from the server's shared library (Livsmedelsverket and the like) that your meals, recipes, portions,
sensitivity flags and icon overrides use. That library lives in the server's central database, not
in yours, so without them the food names in your meals would not resolve on another server.

## Saved account data included

This is a full copy of the per-user database, not a selection of page summaries or metric projections.
It includes saved People profiles, observations and history, goals and goal events, important dates
and care episodes; Work records; CPAP records; treatments, regimens and administration history;
questionnaire definitions, question versions, assessments and answers; custom metrics and user
settings; and the other records stored in that database. Questionnaire answers remain native records,
including their saved definitions and versions, rather than only their derived metric values.

The export contains database schema and saved records, not application page source code. Use the same
customized Aurboda version or a newer compatible version with these features when restoring; upstream
Aurboda alone may not expose the customized People, Work, CPAP or treatment records.

## Keep it safe

The dump holds everything in your database, **including the credentials Aurboda stores for your
integrations** (Garmin, Oura, Strava, Gravl and other tokens or passwords). Treat the file like a
password: don't share it or leave it somewhere public.

## What is not in it

- **Shared Resources and the rest of the server catalogs:** the shared Resources library, its files
  and metadata, and shared catalog entries unrelated to your account are not exported. The referenced
  shared food subset is included through `exported_shared_food_items` as described above; this is not
  a copy of the central database. Saved nutrient snapshots remain in your private database.
- **Server sign-in and access configuration:** the central account record, login password, admin or
  billing status, account email and timestamps, server usage records, MCP/OAuth connector grants and server Oura/Strava webhook registrations are not
  exported. Per-user `webauthn_credentials` records (including public keys and counters) are included,
  but the central user-handle mapping is not. This does not provide portable passkey sign-in.
- **Browser-only state:** unsaved forms, local Work drafts, browser caches and other browser storage
  are not in the server database and are not exported.

After a move, sign up (or have an admin create your account) on the new server, re-register passkeys,
and reconnect integrations whose tokens belong to the old server's OAuth app. Server account setup
and shared resources must be handled separately from restoring the private database.

## Getting the dump

- **Web and Android**: Settings → _Export account data_ → _Download export_. Android saves it to Downloads.
- **REST**: `POST /api/export/dump-link` with your bearer token answers `{ success, url, expires_at }`;
  download `url` (it carries its own token and needs no `Authorization` header). The link works for
  ten minutes and is spent once a download completes.
- **MCP**: the `export_data_dump` tool returns the same link.

One export per user runs at a time (a second answers `409`). The link's single use and that limit
are kept in the backend process's memory, so with more than one backend process (an overlapping
deploy, say) a link could be used once on each. The server needs `pg_dump` at least as
new as its PostgreSQL server; the Docker image ships a PostgreSQL 16 client to match the
`postgis/postgis:16` database in `docker-compose.yml`. Without it the export answers `503` and says why.

## Restoring into another Aurboda installation

There is no in-app upload importer. These steps restore into a [Docker Compose install](docker.md) whose database service is `postgres` with
the superuser `aurboda_service` (as in `docker-compose.yml`). Replace `alice` with your username and the
file name with yours. Run them from the directory with the compose file. Before changing any target database, verify the downloaded file with `gzip -t aurboda-alice-2026-11-06.sql.gz` and keep a separate backup of any target data. A successful gzip check verifies archive integrity, not feature compatibility.

1. **Sign up** on the target server, preferably with the same username. This creates the role `alice`
   and the database `aurboda_alice`. SQL can be restored under a different username, but stored links
   such as `/api/icons/<username>/<id>` can retain the old identity and require repair; restoring does
   not automatically rewrite those references.

2. **Stop Aurboda** so nothing recreates the tables while the database is empty (a logged-in browser or
   the Android app's background sync would), then **recreate the database empty**, owned by you, with
   the extensions Aurboda uses (as superuser, because extensions need it):

   ```sh
   docker compose stop aurboda
   docker compose exec -T postgres psql -U aurboda_service -d postgres \
     -c 'DROP DATABASE "aurboda_alice" WITH (FORCE)' \
     -c 'CREATE DATABASE "aurboda_alice" OWNER "alice"'
   docker compose exec -T postgres psql -U aurboda_service -d aurboda_alice \
     -c 'CREATE EXTENSION postgis' -c 'CREATE EXTENSION pg_trgm' -c 'CREATE EXTENSION unaccent'
   ```

3. **Load the dump as your user**, so every restored table is owned by `alice`:

   ```sh
   set -o pipefail
   (echo 'SET ROLE "alice";'; gunzip -c aurboda-alice-2026-11-06.sql.gz \
     | grep -v -e '^COMMENT ON EXTENSION' -e '^SET transaction_timeout') \
     | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U aurboda_service -d aurboda_alice
   ```

   The dump's `CREATE EXTENSION IF NOT EXISTS` lines only note that step 2 already created them. Its
   `COMMENT ON EXTENSION` lines would fail, since only the extension's owner may comment on it, and a
   dump made by a newer `pg_dump` than the target server sets `transaction_timeout`, which PostgreSQL
   16 does not know, so `grep -v` drops both; with `ON_ERROR_STOP=1` anything else that fails stops the restore and shows
   the error.

4. **Start Aurboda and log in** (`docker compose start aurboda`). The next request migrates the restored schema to the target server's version, so use the same customized version or a newer compatible version that supports the exported features.

   On that first login (or when Aurboda starts) the shared food items in `exported_shared_food_items`
   are matched to the new server's library, and the table is dropped. An item the new library holds
   under the same id is left as it is; one it holds under another id (the same source and source id,
   say the same Livsmedelsverket number) has your meals, recipes, portions, flags and icon overrides
   moved over to it; anything else becomes your own food item, with your icon and default quantity
   on it, and an item of yours with the same name already there gets the source added to the copy's
   name. If that step fails, it is logged and tried again on the next start.

A restore into a server without Docker works the same way: run the `psql` commands as a superuser
against that server.

The backend's integration test (`apps/backend/src/services/export-dump.integration.test.ts`) dumps a
database with the real `pg_dump` and restores it with exactly these steps;
`exported-shared-food.integration.test.ts` does the same with shared food items in the data and
checks the matching against libraries that have them under the same id, under another id, or not at all.

## Foghouse integration checkpoint (November 13, 2026)

The SQL stream now starts with comments identifying `aurboda_export_format: private_postgresql`
and `aurboda_export_version: 1`. These do not change the gzip filename, SQL restore commands,
full-schema contents or referenced shared-food trailer. The schema and saved feature versions
remain in the SQL; the format number is not a promise of compatibility with every application build.

Journal storage from `feat/foghouse-journal` (`37637a5f`) was integrated during this task. All six
Journal tables, including original audio/image BYTEA, live in the private database and are included
by this full dump. This covers saved entries/content/dates, areas/tags/favorites/pins, personal
areas/templates, workbook answers/progress/status and immutable prompt/version definitions, record
links, recoverable revisions, trash and still-retained attachments. Browser-only drafts and unsaved
recordings are excluded. Permanently removed attachment bytes are no longer recoverable from a new
export. See [Journal integration and verification](ai/journal-data-integration.md).

The existing manual SQL restore path is retained; there is no in-app Journal importer or automatic
cross-username external-link remapping. Internal Journal UUIDs and relationships are preserved by
SQL restore. Expanded fixtures compare all Journal tables, original audio/image bytes, workbook
progress/versions, retained trash/revisions and tenant isolation. **The real Journal round trip has
not run here** because no container runtime is available. Historical pre-Journal results do not
verify these newly integrated records.

Export issuance uses the authenticated account even if a request supplies another username.
Download links are bearer capabilities for that fixed account, so protect them like the exported
file. Disconnecting an AI connection does not recall a previously issued export link or downloaded
file; existing links expire after ten minutes and are spent on completion (process-local limits
above still apply). Analysis-only connectors do not receive database-dump access because dumps
can contain integration credentials.
