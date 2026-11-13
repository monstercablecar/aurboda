# Journal data integration and verification

The initial privacy/export work inspected base `a5baa639`, which had no Journal schema. During
this task the Journal agent published `37637a5f` on `feat/foghouse-journal`; that implementation
was merged, preserving its UI, workbook catalog and storage. This integration uses its services
and six private tables, not a competing Journal model. No production deployment occurred.

## Implemented contracts

| Concern              | Source                                                   | Behavior                                                                                                                           |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Types and validation | `packages/api-spec/src/schemas/journal.ts`               | Single canonical schemas, snake_case, ISO timestamps; schema version advertised by capabilities                                    |
| Storage              | `apps/backend/src/schema/journal.ts`                     | Six owner-database tables: settings, areas, entries, templates, revisions and attachments                                          |
| Shared logic         | `apps/backend/src/services/journal.ts`                   | REST and MCP use the same per-user transactions and parameterized queries                                                          |
| REST                 | `routes/journal-router.ts`, mounted under `/api/journal` | Authenticated owner only; browser tokens retain normal writes; OAuth read grants accepted on Journal GET/HEAD only                 |
| OAuth read auth      | `api/journal-read-auth.ts`                               | Revalidates scope, expiry, revocation and deleted account, checks schema; no username override and no write authorization          |
| MCP                  | `mcp/journal-tools.ts`, `mcp.ts`                         | Owner captured from token; catalog, capability discovery, list/search, full reads, revisions, areas/templates and media readers    |
| Read permissions     | `mcp/connector-permissions.ts`                           | Explicitly reviewed Journal readers enabled; mutations excluded; guessing hidden tool names does not bypass scope                  |
| Export               | `services/export-dump.ts`                                | Full owner database SQL includes Journal JSONB and original attachment BYTEA without an attachment-URL substitute                  |
| Restore fixture      | `services/export-dump.integration.test.ts`               | Actual Journal service fixtures, byte comparisons, workbook/context links, trash/revisions and ownership checks; not executed here |

`list_journal_entries` / `GET /journal/entries` uses `page` and `per_page` (maximum 100) with
stable pinned/time/ID ordering. Filters include search, `from`/`to`, area (including General),
tag, favorite, kind, deleted/trash and workbook identifier. Search matches titles, content,
tags and workbook answers only in the authenticated database; totals are calculated there too.

`get_journal_entry` returns the complete entry. A workbook attempt is an entry with an immutable
`workbook.definition` snapshot (including source, version, sections and prompts), raw answers keyed
by stable prompt ID, completed sections, resume section and status. A separate attempt/answer model
or reader is unnecessary. Recoverable revisions contain previous entry snapshots. Permanent entry
deletion requires trash and version checks, then cascades revisions/media. Direct attachment
removal permanently removes those bytes; previous entry snapshots do not recreate removed media.

## Private media and AI limitations

`list_journal_attachments` returns metadata. `get_journal_attachment` returns original base64 bytes
up to 1 MiB. Larger originals use the **existing** authenticated REST
`GET /api/journal/attachments/:id`, now accepting the same valid OAuth read token; there is no public
URL or need to grant full browser access. Upload limit remains 20 MiB. The combined nginx configuration permits 21 MiB including multipart framing and disables Journal request/response disk buffering and access logging; outer infrastructure limits/logging still require operator verification. The response is private,
`no-store`, `nosniff` and a download; private Journal media never uses the public feed-picture path.
No new public signed-URL capability or media cookie is introduced. The REST path returns whole
files; it does not promise byte-range streaming. OAuth grants on this reader do not authorize
POST/PATCH/DELETE Journal REST routes.

An audio file being available does not establish that an AI client can interpret it. The client
must support binary/base64 retrieval, MIME/codec and audio input. Text-only clients may see only
metadata. This change adds no transcription or automatic upload to a transcription provider.

All retrieved Journal fields, immutable prompts, filenames and linked-record labels are untrusted
user content. They cannot change account selection, scopes or tool policy. The MCP server explains
this boundary, but cannot guarantee arbitrary clients are immune to prompt injection. Analysis is
optional, uses the existing OAuth/MCP connection and requires no hosted AI dependency. New consent
explicitly covers journals when available; read-only access does not grant content editing/deletion.
Legacy full-access connections remain identified and revocable; reconnect for read-only scope.

## Export and restore coverage

All of these are stored in the private database and therefore included by the existing full dump:

- Text/content and occurrence/creation/update/deletion timestamps; area IDs; tags; favorite/pin and
  resurfacing settings; record links and entry identifiers.
- Personal areas, templates and initialization settings.
- Full immutable workbook definitions, prompt/version context, raw answers, progress/resume and status.
- Recoverable entry revisions, trashed entries and media still retained by the feature.
- Original audio/image bytes, attachment MIME/filename/timestamps and workbook prompt associations.

The expanded fixture seeds all six tables, custom areas/templates and links, revised text, three
workbook statuses and original audio/image buffers; it compares restored rows, answers/progress and
bytes, checks unrelated-account exclusions and uses restored services under the destination account.
Internal UUIDs and relationships are preserved by full SQL restoration. Existing cross-username
external links are not generically remapped. See [manual SQL restore](../data-export.md): there is
no in-app upload restore. Browser-only drafts and unsaved recordings are not server-saved records.

**The real Journal dump/restore fixture and database isolation suites could not run in this
environment because no working container runtime exists.** Source-level database-byte inclusion
and prepared assertions are not a successful round trip. Do not claim a tested restorable Journal
backup until those tests pass on a compatible PostgreSQL environment.

## Verification boundaries and remaining work

Synthetic focused HTTP/MCP tests exercise authenticated account binding, two ordinary users and an
admin-named account, read-only mutation refusal, scope/expiry/deleted/revoked tokens, metadata and
large original REST media retrieval. Existing database suites contain actual cross-account
list/search/read/update/delete/revision/media checks. The export suite also prepares role-level
ordinary-user denial and privileged operator support reads. No real user data is used.

Remaining release gate: run the database suites and full restore against PostgreSQL, including the
new filter, actual role ACLs, original bytes and all restored references. Journal UI/microphone and
Android device verification remain owned by the Journal feature (see [Journal guide](../journal.md)).
Direct privileged database access remains available to the operator and is not tracked by the
application's request audit log. No administrator impersonation or support dashboard was added.
