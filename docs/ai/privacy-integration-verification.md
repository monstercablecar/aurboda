# Privacy and Journal integration verification

November 13, 2026. Base Foghouse customizations: `a5baa639`; Journal implementation merged from
`37637a5f`. The Journal UI/catalog/storage are the other agent's implementation. This task extends
its existing read/export interfaces, optional OAuth permissions and the Foghouse policy. No new
Journal storage, administrator impersonation/support dashboard, transcription or deployment.

## Verified locally

Toolchain: Node 26.13.1, pnpm 10.33.4; frozen lockfile install and shared API build.

| Check                                                   | Result                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Focused backend regression, 17 files                    | 255 tests passed                                                |
| Focused web regression, 8 files                         | 44 tests passed                                                 |
| `pnpm check` (backend/web/API-spec type and lint)       | Passed; repository-wide warnings remain, zero errors            |
| API-spec full OpenAPI/TypeScript/Kotlin/docs generation | Passed; generated outputs are ignored per repository convention |
| API-spec Kotlin generator fixup tests                   | 6 passed                                                        |
| Foghouse-enabled web production build                   | Passed; existing large-chunk advisory                           |
| Scoped formatting/lint and `git diff --check`           | Passed                                                          |

Backend focus: OAuth consent defaults/write option; owner-scoped connection listing/revocation;
refresh/revoke race serialization; expired/revoked/unknown-scope refusal; two ordinary users and
an admin-named account; explicit reader allowlist and refused guessed/mutating tools; no query-time
provider sync for read-only connections; Journal discovery/list/search/workbook context/media;
private REST OAuth download of original media over 1 MiB; refused Journal REST mutations; export
ownership, capability tampering and existing streaming/token failure behavior. The HTTP fixtures
use synthetic grants and mocked data stores; they establish routing/permission behavior, not real
PostgreSQL ACLs or a successful restore.

Web focus: Foghouse opt-in and exact footer adjacency; policy scoping/disclosures; connection labels,
revoke/retry and delayed account-switch responses; existing export controls and session fencing;
Journal draft/audio controls. No real microphone, Android device or visual browser verification.
Android Settings uses the existing embedded `/settings` page; no duplicate native Settings form was
added. The Journal agent's device/microphone caveats remain in [Journal](../journal.md).

## Unexecuted and blocked checks

The real dump/restore suite failed during global setup before test execution with
**Could not find a working container runtime strategy**. No Docker or `pg_dump` is available here.
Its expanded Journal fixture covers all six tables, original image/audio BYTEA, immutable workbook
prompts/versions/answers/progress/status, internal links, revisions, retained trash, tenant exclusion,
restored ownership and direct service access. Prepared ordinary-role SQL denials and privileged
operator support reads must run against PostgreSQL. They are not a current test pass.

The broad backend unit run was blocked by automatic approval review because it could reach the
external Oura API and the payload could not be established as synthetic/authorized. It was not
retried through another route. Focused runs instead select reviewed mocked-provider/synthetic
suites. The draft integration commit uses `[skip ci]` to avoid implicitly launching that same broad
run through GitHub; CI is not claimed green. Do not merge until the remaining checks are safely
isolated and the real database suites pass. No automatic review gate is bypassed by a draft PR.

`pnpm fix` was invoked during implementation and initially caught an in-flight test lint issue,
which was corrected. Unrelated monorepo formatter-only edits were removed to preserve scope;
final scoped format/lint and full `pnpm check` passed.

## Operational and release boundaries

No real accounts, databases, exports, backups or runtime secrets were inspected. Source evidence
supports per-user PostgreSQL storage, the privileged service role, Journal originals in BYTEA,
optional sync/federation/push and optional Sentry (`sendDefaultPii: true` if enabled). Historical
docs describe local containers and a public tunnel; current infrastructure/provider access,
telemetry configuration, log/backup retention/deletion and privacy contact remain unverified.
The policy explicitly identifies those missing facts and makes no exclusive-infrastructure-access
or immediate-backup-erasure promise.

Enable the instance policy only in a Foghouse build with
`VITE_FOGHOUSE_PRIVACY_ENABLED=true` (combined image build argument of the same name). Default is
off for other self-hosters. OAuth scope migration is expand-only, but old server versions ignore
new scopes: do not rely on read-only enforcement while old code still handles traffic. Legacy
null-scope grants and AES browser/API tokens retain their previous full access; reconnect OAuth
clients for read-only, and do not represent OAuth revocation as individual AES-token revocation.

See [access architecture](../data-access.md), [policy evidence](../foghouse-privacy.md),
[export/restore](../data-export.md), [MCP behavior](../mcp-server.md) and
[Journal integration](journal-data-integration.md) for code maps and exact coverage limits.
