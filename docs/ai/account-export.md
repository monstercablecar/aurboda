# Account export: scope and verification map

Audited November 12, 2026. User requirement: export only the selected account's saved application data, in a restorable format. Shared Resources are explicitly outside this task. Read [export and restore instructions](../data-export.md) before changing the format or making portability claims.

## Flow and ownership

`apps/web/src/components/DataExportSettings.tsx` → `state/api/settings.ts:requestExportDumpLink` → authenticated `POST /export/dump-link` in `apps/backend/src/routes/export-router.ts` → `services/export-dump.ts:createDumpLinkIssuer`. `GET /export/dump` validates its encrypted capability token, selects the token's user database, streams `pg_dump` through gzip, and spends the token after completion. MCP `mcp/export-tools.ts` uses the same issuer. Android's `EmbeddedWebScreen.kt` hands the same-origin download to DownloadManager.

The format remains `aurboda-<user>-<date>.sql.gz`: full plain SQL schema/data, no owner/grant statements, not a CSV summary, JSON-only backup or in-app import format. `pgDumpArgs` has no feature/table allowlist. Only PostGIS `spatial_ref_sys` row data is excluded because the extension supplies it on restore. New per-user tables are included automatically.

The Settings component prevents duplicate pending requests and ignores delayed results after unmount/session change. This supplements the existing global Axios session fence. It does not revoke already-issued capability links: they remain usable until expiry/completion, and spending/concurrency state is process-local. No stronger revocation guarantee was introduced.

## Custom saved data

| Area                        | Actual storage included                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| People                      | `people`, `people_events` (including relationship-state start/end history), `people_reminder_deliveries`, `people_feedback`, `people_metric_points`. Profiles contain important dates, care episodes and embedded photo data; events contain goals, journals and observations. |
| Work                        | `user_settings.settings.work`, canonical `activities.data`, `notes`, `time_series`, `custom_metrics` and activity definitions. Browser-only Work drafts are excluded.                                                                                                          |
| CPAP                        | Custom metric definitions and time-series points; the client-parsed original CSV is not retained by that import workflow.                                                                                                                                                      |
| Simple Food and assessments | `questionnaire_templates`, `assessment_questions`, `assessment_question_versions`, `assessments`, `assessment_responses`; context definitions/events and derived metrics. Saved questionnaire versions and raw answers are retained, not only projections.                     |
| Treatments                  | Substance/regimen definitions and versions, items, treatment types/sessions, administration events/revisions and context records.                                                                                                                                              |
| Other private data          | Goals, saved settings/definitions, icons in `uploaded_icons.data`, meals, metrics, activities, locations, notes and other per-user tables.                                                                                                                                     |

## Boundaries to preserve

Do not dump the central database into a user export. Shared Resources metadata/files, shared food/reference catalogs, central account/email/billing/usage records, admin grants, webhook mappings and central authentication mappings are outside the private database. Per-user passkey credential records are present, but central handle mappings are absent; passkey sign-in is not portable. Integration credentials stored in the private database are present and make the download sensitive.

Unsaved forms/local drafts, source-code guidance catalogs and application code are not database records. Restore onto the same or a newer compatible customized application. Shared-food names/icons may require the destination's shared catalog; nutrient snapshots remain private records. Same-username restores avoid leaving username-bearing links pointing at the old identity. These limitations are disclosed in the user guide, not silently represented as a complete server migration.

## Tests and extension guidance

- `apps/backend/src/services/export-dump.integration.test.ts`: real tokenized HTTP link/download, gzip integrity, documented SQL restore into another disposable user database, exact rows across 29 seeded tables, public table inventory equality, versioned-answer and treatment relationships, tenant exclusion, ownership and migration.
- `apps/backend/src/services/export-dump.test.ts`, `export-token.test.ts`, `routes/export-router.test.ts`: streaming failure/abort/retry, client compatibility, tokens and download transport.
- `apps/web/src/components/DataExportSettings.test.tsx`: button, duplicate prevention, error/retry, delayed unmounted/session-changed result.
- Existing account-isolation/session-boundary tests remain relevant; the short-lived download capability is deliberately independent of current browser session after issuance.

When adding persisted private features, extend the roundtrip fixtures with real representative payloads/relations. Compare restored content, not only counts. Test against disposable databases only; never export a live account merely to inspect its contents. Re-check portability separately if new private bytes live outside PostgreSQL. Use the host's compatible PostgreSQL client or explicitly documented containerized test tools; production exports use the client in the application image.

## Verified release

`a537f53` deployed November 12, 2026 as `account-export-a537f53`. Final checks passed: two real HTTP download/restore integration tests (29 populated tables plus complete public table inventory), 91 export/token/router/account-gate unit tests, 18 export UI/account-isolation/session-boundary tests, backend/web typechecks, scoped lint/format, production web build, documentation links and whitespace checks. Existing web chunk-size advisory remains. The complete application test suite and Android SDK build were not run for this change.

The test host lacks PostgreSQL client tools; temporary PATH wrappers ran genuine PostgreSQL 16.4 `pg_dump`/`psql` in the cached disposable PostGIS container image against test databases. Archive CRC validation and shell pipefail were included in the final successful restore run. Initial fixture validation mistakes were corrected before that run. Separately, read-only live tool-version checks confirmed application `pg_dump` 16.15 against PostgreSQL 16.4; no live database rows or private exports were read.

Deployment completed the backup and matching source-manifest workflow. Public status matched the exact release, and both anonymous link issuance and an invalid download token returned 401. Transient restart errors resolved within the health loop. Protected record: `releases/20261112T221833Z.account-export-a537f53.YIEtzK` under the local installation. The full per-user dump mechanism and format were retained; production changes clarify coverage and prevent stale/duplicate frontend download actions.
