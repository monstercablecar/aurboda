# Child guide and useful metrics verification

Verified November 12, 2026. This is the infant-guide change following the `40dbf90` documentation handoff; earlier reports remain historical evidence.

## Delivered scope

- 33 new source-linked records; catalog total 142 records / 42 sources. Fifteen sources have short attributed quotations checked against official publisher pages. See [coverage](../people-catalog-coverage.md) for exact source and age scope.
- Server-owned child guide: safety, help, play and observations. Infant title “Super Baby”; age-appropriate play uses corrected developmental age where applicable, while safety and medical help use chronological age. Adult children without tagged guidance retain the regular dashboard.
- Optional rolling contact/shared-time/care metrics, 24-hour infant logs and goal lifecycle counts. New IDs use `recorded:` to avoid collisions with existing arbitrary unit strings. Legacy IDs/preferences remain intact.
- Typed weight/length/head-circumference and wet/dirty/mixed logs, exact-unit aggregation, observation timestamps and direct recording buttons. No clinical ranges, diagnoses or quality scores.
- Shared schema changes flow through existing REST/MCP services and Android's embedded People page; no new database table or backfill.

## Checks

- Web suite: **159 files / 1,561 tests passed**. The initial restricted run could not spawn the DST test subprocess; rerun with required process access passed.
- Focused backend rules, catalog, gender context and real-PostgreSQL persistence: **4 files / 76 tests passed**. Covers guide boundaries, feedback visibility, unit separation, window clipping, overlap union, legacy fields, corrections and clearing.
- REST ownership/authentication and MCP checks: **2 files / 10 tests passed** with required local test-server access.
- Final metric empty-state copy regression: People **29 tests passed**, followed by web typecheck.
- Shared and web typechecks passed. Production web build passed with the existing large-chunk advisory. Backend typecheck still reports only the known `apps/backend/src/schema/work.ts:1` extensionless-import TS2834.
- OpenAPI, TypeScript and Kotlin models regenerated and shared package built. Generated files follow existing ignore rules. Android SDK build/test was not performed.
- Visual check used a clearly named temporary six-month-old profile in the local preview: guide, visible safety actions, navigation anchors, metric windows and Record Diaper form verified. Fixture removed afterward. No production person records were created or inspected; the user's existing draft tab was not navigated or reloaded.

## Boundaries

Official source checking supports the selected claims; it is not clinical certification or comprehensive pediatric coverage. Urgent-help content contains selected signs and links to the full official source, not an automated triage assessment. Missing logs never establish absence of care. Exact source quotes remain distinct from authored summaries.

The documentation generator reverted customized source-table wording during generation; those unrelated output changes were restored and the generator/catalog mismatch recorded in [technical debt](../ai/technical-debt.md). Concurrent Treatments/pharmacology work was excluded from this feature's commit and source patch.

## Deployment

Application commit `eefee14` was built from the synchronized customized deployment source and deployed on November 12, 2026 after the backup script completed successfully (including archive validation). Image `localhost/foghouse-aurboda:super-baby-eefee14` is active through the `career` tag; the previous image remains `localhost/foghouse-aurboda:before-super-baby-eefee14`. Local and public `/api/status` returned success and version `eefee14`; unauthenticated public `/api/people` returned HTTP 401. The user service was active. Python's default public HTTP client received a tunnel 403; the normal curl public checks succeeded.
