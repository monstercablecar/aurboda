# Foghouse instance privacy policy

The instance policy is rendered by `apps/web/src/pages/FoghousePrivacy/index.tsx` at `/foghouse-privacy`.
`apps/web/src/foghouse-privacy.ts` requires the build-time value
`VITE_FOGHOUSE_PRIVACY_ENABLED=true`. It defaults off. Set it only for a Foghouse-operated web
build, then rebuild the web application. A backend environment change alone does not change a
previously built bundle. For the combined container image, pass
`--build-arg VITE_FOGHOUSE_PRIVACY_ENABLED=true`; its default is `false`. This task does not enable or deploy the policy on a running server.

The enabled footer retains the existing Privacy link and adds **Foghouse Privacy** immediately next
to it in the existing right-aligned, wrapping footer. `/privacy` then shows an instance-policy
notice instead of the generic upstream assertions about no third-party transfer and complete
erasure. Other self-hosters retain their generic page, receive no Foghouse link, and cannot obtain
Foghouse commitments by visiting `/foghouse-privacy` directly; that route explains that the policy
is not enabled. This configuration is a branding and disclosure boundary, not an authorization check.

## Policy commitments and evidence

The policy distinguishes a user's own access, voluntarily authorized integrations, and restricted
administrator support. The administrator may access stored data only to confirm/investigate bugs
or perform user-authorized actions. It makes no end-to-end encryption, administrator-inaccessible
storage, infrastructure-exclusive-access or comprehensive audit guarantee.

The following are source-code facts, not a production infrastructure audit:

| Subject                | Evidence and disclosure                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Private storage        | `apps/backend/src/db/connection.ts` selects a per-user PostgreSQL database. Private records, settings, credentials and tokens are persisted by the relevant feature's database modules.                                                                                                                                                                                                    |
| Journal                | `apps/backend/src/schema/journal.ts` and `services/journal.ts` store private text, immutable versioned workbook prompt snapshots and answers/progress, record links, personal templates, revisions, trash and original audio/image bytes. See the Journal evidence below; source coverage is distinct from an executed restore test.                                                       |
| Attachments            | `apps/backend/src/db/feed-images.ts` stores feed-image bytes in the private database. `apps/backend/src/routes/public-feed-image-router.ts` exposes pictures by link; do not reuse that access model for private Journal media. People can embed photo data in their saved profile. `docs/resources.md` describes central metadata and configured filesystem storage for shared Resources. |
| Export                 | `apps/backend/src/routes/export-router.ts` uses the authenticated user for link issuance. `apps/backend/src/services/export-dump.ts` runs the private database's full `pg_dump`; the export includes integration credentials. See [export and manual restore](data-export.md) for the central-data exclusions, temporary capability links and cross-username link limitations.             |
| Deletion               | `apps/backend/src/services/account-deletion.ts` drops the account database/role, reserves the deleted name and attempts central cleanup, integration disconnect and federation notification. Secondary operations are best effort. No code here proves removal of independent backups or externally retrieved copies.                                                                      |
| Logs                   | `apps/backend/src/api/audit-body.ts` and `api/middleware.ts` summarize automatic write-request bodies structurally. Other direct audit/error and infrastructure logging remains outside that guarantee. See [audit privacy](ai/privacy-hardening.md). Application support auditing cannot establish direct database auditing.                                                              |
| AI                     | `apps/backend/src/mcp.ts` exposes optional user-authenticated tools, and `services/oauth.ts` handles connector authorization. External clients/providers retain responsibility for information already retrieved. Audio file availability is distinct from client audio interpretation; this integration adds no transcription.                                                            |
| External flows         | Source integrations call configured providers; federation code sends deliberately shared content to remote servers; `services/browser-push.ts` sends notifications through the subscription's browser push provider when enabled.                                                                                                                                                          |
| Error telemetry        | `apps/backend/src/services/sentry.ts` initializes errors-only Sentry reporting when `sentry_dsn` is configured, with `sendDefaultPii: true`. Current enabled state and destination have not been inspected; the policy discloses possible request/personally identifying information.                                                                                                      |
| Example infrastructure | `docker-compose.yml` describes an application container, PostgreSQL and a Resources file volume. It is not evidence that the Foghouse production topology uses only these components.                                                                                                                                                                                                      |

## Journal integration evidence

The integrated [Journal](journal.md) stores all six `journal_*` tables in the authenticated user's
private database. `apps/backend/src/schema/journal.ts` defines entry payloads and creation metadata,
areas, templates, revisions, settings and `journal_attachments.bytes BYTEA`. The shared
`packages/api-spec/src/schemas/journal.ts` describes text, dates/timestamps, tags, favorites, pins,
record links and workbook attempts. `services/journal.ts:createJournalEntry` snapshots the catalog
definition, including its version, source, sections and prompts. Updates cannot replace that
snapshot; answers, completed sections, resume section and status remain with the attempt.

`addJournalAttachment` saves the original uploaded image/audio `Buffer` unchanged in the private
database, with filename, MIME type, size, entry/prompt links and creation time. Original media may
retain embedded metadata. `routes/journal-router.ts` serves it only after authentication, with
`Cache-Control: private, no-store`; it does not use public feed-image URLs. `mcp/journal-tools.ts`
provides authenticated attachment metadata and small base64 reads, with bearer-authenticated REST
for larger media. Access remains bound to the authenticated account. Media availability is not
transcription or a guarantee that a client understands audio.

The existing full private-database `pg_dump` has no Journal allowlist/exclusion, so its SQL includes
Journal record rows and original binary attachment bytes, not expiring links. It also includes entry
revisions and records marked as trashed. Source inspection establishes this storage/export path;
**Journal round-trip restore tests have not executed in this environment because no working
container runtime is available**. Added restore fixtures are not a passing restore result. Consult
[data export](data-export.md) for current test status and migration limitations. Browser-only drafts
and unsaved recordings remain outside the server export.

`updateJournalEntry` retains previous entry snapshots and marks trash through `deleted_at`.
`deleteJournalEntry` requires an already-trashed entry and current version, then deletes the row;
foreign-key cascades remove its revisions and attachments from the active database. A direct
attachment deletion removes its bytes; entry revisions do not retain a second attachment copy.
None of these operations establishes immediate removal from independent backups or prior downloads.

## Missing operational facts

Historical [operations documentation](ai/history-and-operations.md) records a local rootless Podman
server with a loopback origin behind a public tunnel; [Resources documentation](resources.md) records
matching database/file backups and pausing application writes. A backup script's historical 365-day
default is not a verified current retention period. No live environment or user data was read to
confirm these records.

The actual hosting provider, current reverse proxy/tunnel, monitoring and log destinations, backup providers
and locations, their data flows/access, retention periods, backup deletion procedures and an operator
privacy contact have not been verified in this task. The rendered policy identifies these omissions.
Do not replace them with invented contact details, retention periods or certifications. Before a
production policy release, the operator should supply the facts and review the rendered wording.
The policy does not claim that all service providers lack technical access or that no third-party
processing occurs.

## Verification

`apps/web/src/components/Footer.test.tsx` verifies disabled and enabled builds, exact label/link
adjacency and preserved existing links/tagline. `apps/web/src/pages/FoghousePrivacy/index.test.tsx`
verifies route scoping, material disclosures and the generic-page override. These are rendering and
configuration tests, not proof of backend tenant isolation or operational retention practices.

Signed-in users can review active OAuth connections and revoke a client in **Settings → AI and MCP
connections**. This ordinary-user section displays read-only, read/write or legacy permissions; it
does not grant administrator support access. Revocation does not recall retrieved data or revoke
separate browser/API tokens.
