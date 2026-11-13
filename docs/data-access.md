# Foghouse data access and integration boundaries

This documents source behavior for the November 13, 2026 privacy/integration change. It is not a
live infrastructure audit. No real user data, production databases, exports, backups, secrets or
runtime settings were inspected. No production deployment is part of this task.

## Account isolation and administrative support

`apps/backend/src/api/middleware.ts:createAuthMiddleware` derives `req.user` from the authenticated
token, rejects deleted users and awaits the account schema check. Private routes such as
`routes/people-router.ts` pass this identity to shared services, not a username from request data.
`db/connection.ts:getDbForUser` selects `aurboda_<username>` and creates a role-scoped pool.
`makeNewUserDb` grants the new role to the configured backend service role. The service's existing
privileged PostgreSQL connection remains available to the operator. This change adds no encryption,
impersonation, support API, admin bypass or administration dashboard.

Application admin status (`centralDb.isAdmin`) permits existing account/instance administration;
it does not silently cause ordinary private routes to select another account. An admin login's
private exports remain its own exports. Authorized operator support can use the existing privileged
backend/database architecture. That technical capability is different from permission to inspect
unrelated data. The Foghouse policy restricts support use to bug investigation or user-authorized actions.

The application's automatic write audit uses structural body summaries; it is not a database access
audit. Direct database reads do not become audited merely because an application admin exists.
Other audit/error/infrastructure logs remain outside the automatic-body-minimization guarantee.
See [request audit privacy](ai/privacy-hardening.md) and [instance policy evidence](foghouse-privacy.md).

## Existing optional AI analysis mechanism

There is no built-in hosted LLM analyzing Journal bodies. The existing feature exposes tools to a
user-selected MCP client through `/mcp`; the frontend Help links to `docs/mcp-server.md` and clients
configure the server URL externally. `api.ts` mounts the same `createMcpRouter` using the existing
backend services and optional provider clients. No parallel server or required AI provider is added.

Code reference map:

| Concern                                                                         | Source                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Endpoint, bearer authentication, per-request owner closure, stateless transport | `apps/backend/src/mcp.ts:createMcpRouter`, `createMcpServer`         |
| OAuth discovery, login/consent, client registration, token/revoke routes        | `apps/backend/src/routes/oauth-router.ts:createOAuthRouter`          |
| PKCE S256 code exchange, access/refresh rotation and validation                 | `apps/backend/src/services/oauth.ts`                                 |
| Central client/code/token persistence, expiry/revocation checks                 | `apps/backend/src/services/central-db.ts`                            |
| Legacy AES-256-GCM account bearer tokens                                        | `apps/backend/src/auth.ts:createAuth`                                |
| Abbreviated discovery and full descriptions                                     | `apps/backend/src/mcp/tool-catalogue.ts`                             |
| Billing account read-only gate (separate from connector consent)                | `apps/backend/src/mcp/read-only-gate.ts`, `services/account-gate.ts` |
| Existing account database export and its credential-sensitive scope             | `apps/backend/src/mcp/export-tools.ts`, `services/export-dump.ts`    |

MCP creates a fresh server per authenticated POST; GET and DELETE return 405 (no SSE or sessions).
Tools capture the authenticated account in their closures. The unused legacy session-store module
is not the current MCP authorization boundary. Central OAuth tokens are checked on each request;
access tokens expire after one hour, refresh tokens after thirty days, and codes after ten minutes.
Refresh rotates the pair. See [MCP permissions and revocation](mcp-server.md) for this change's
read/write consent and connection-management endpoints, including legacy full-access grants.

AES browser tokens remain full access, have no intrinsic expiry and cannot be individually revoked
by the OAuth connection controls. Logging out or deleting a connector from the AI client's UI alone
is not guaranteed server revocation. Account deletion's existing deleted-user check prevents a
stateless token from reopening a deleted account. Rotating the session secret invalidates the
server's AES tokens broadly and is an operator action, not a new user revocation feature.

Private data returned through MCP is untrusted content. It cannot change the authenticated account,
grant scopes, authorize tool use or override policy. Revocation prevents subsequent authorized
requests, not already accepted operations or information already copied by an AI provider. Do not
send real data to an AI provider to test permissions. Audio availability is not transcription: an
AI client must support audio media itself to interpret authorized original bytes.

## Export, media and Journal integration

The existing Settings export is a gzipped plain SQL dump of one private database, including stored
BYTEA/embedded media and integration credentials, with a referenced shared-food trailer. It has
no table allowlist. It excludes the rest of the central database, shared Resources files and
browser-only state. Short-lived download links are transferable bearer capabilities, not expiring
URLs used in place of attachment bytes. See [export/restore](data-export.md).

Feed pictures are intentionally public by link and are transformed for that feature; Resources
are an authenticated shared library. Neither is a private Journal attachment store. Do not reuse
their broader audiences for Journal media. Journal schema/storage was absent at initial base `a5baa639`; Journal commit `37637a5f` was then
integrated. Its six per-user tables include original attachment BYTEA and immutable workbook
snapshots, so the existing dump includes the actual saved bytes and content context. The
[Journal integration reference](ai/journal-data-integration.md) maps actual endpoints, read scopes,
version context, export fixtures and unexecuted database checks. `api/journal-read-auth.ts` permits
valid OAuth read tokens on Journal GET/HEAD (including originals over the 1 MiB MCP limit) while
leaving Journal writes behind the existing account authentication. Revocation and account identity
are rechecked for media; no public URLs or additional full-access credential is required.

## Operational disclosures

The source and historical docs describe local containers, PostgreSQL, filesystem Resources and a
public tunnel. They do not prove the current hosting/provider topology or retention. Optional
Sentry uses `sendDefaultPii: true` if configured; sync, federation, push and external AI introduce
feature-dependent third-party processing. Current enabled providers, log/backup locations and
retention, backup deletion behavior and privacy contact remain unverified. The configured policy
states those limits instead of inventing exclusive-access or deletion guarantees.
