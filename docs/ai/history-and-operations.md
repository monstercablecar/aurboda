# History, verification and operations

Audited against `feat/people` documentation HEAD `e6cd290` on November 12, 2026 (America/Denver), with latest verified application release `0acf375`. This page separates repository evidence, recorded validation and this installation's deployment facts. It is not a fresh full-system test report.

## What the history establishes

| Commit    | Verified scope                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00b3982` | Snapshot of the existing customized Aurboda application for isolated People development. This root snapshot does not establish when, or by whom, each pre-existing customization was authored. |
| `5232dc4` | Initial private People profiles, deterministic guidance, observations, metrics, customization and optional reminders.                                                                          |
| `6766a01` | Optional identity context, meeting details, important dates and private memories/journal entries.                                                                                              |
| `81e4a93` | Explicit People goal controls and lifecycle; important-date projection into Timeline; Google Calendar review links; structured questionnaire choices and nutrition ownership corrections.      |
| `eefee14` | Infant/child guide, source quotations and typed optional tracking; verification recorded in `e64ceae`.                                                                                         |
| `9835b5f` | Eight temporary-care contexts, 101 additional recommendations, milestones, consent-aware tracking and catalog Help Tree; deployment recorded in `cf69557`.                                     |
| `0acf375` | Connected Help Tree graph: age/context rails, real catalog edges, focused inspector and List alternative. See `docs/people-care.md` for scoped validation.                                     |
| `f1d8fd1` | Practical care ethics guide; deployment evidence recorded in documentation commit `e6cd290`.                                                                                                   |

The original customized checkout was based on upstream `feae57c` with local changes; the isolated snapshot is not an upstream release. Work, CPAP, mental assessments, Simple Food and Treatments already existed in the baseline. Their presence does not establish an implementation chronology. Upstream Aurboda and its `aurboda.net` identity are distinct from this private Foghouse deployment.

The routed Work page is `apps/web/src/pages/WorkMetrics` (see the `/work` route in `apps/web/src/index.tsx`). Do not equate that delivered page with everything under `apps/configurable-work-engine/`, or with the archived draft `docs/experiments/work-schema.ts.txt` (formerly `apps/backend/src/schema/work.ts`). The latter is preserved outside compilation and contains invalid draft SQL; its existence does not prove that schema is installed or that a configurable work engine is operational. Plans, scratch material and reference documents require confirmation against routes, services and actual schema registration before being described as shipped features.

## Subsequent child-guide update

Commit `eefee14`, deployed and verified November 12, extends the catalog to 142 records and 42 sources, adds attributed source quotations and server-owned child sections, and preserves legacy tracking while adding rolling summaries and typed growth/diaper entries. See [scope and verification](../people-verification/super-baby.md). This does not change the provenance of earlier Work/People history.

## Recorded verification, with boundaries

The release-specific evidence is in [initial verification](../people-verification/report.md), [enrichment verification](../people-verification/enrichment.md) and [goals/calendar/questionnaire verification](../people-verification/goals-calendar-questionnaires.md). Read them chronologically: the initial report's “not deployed” statement and 103-record catalog count describe that earlier checkpoint, not the later release. Enrichment brought the catalog to 109 records and 33 sources.

For `81e4a93`, the recorded final web run passed **158 files / 1,553 tests**; web typecheck and production build passed. Focused backend units passed 51 tests, and People database integration plus REST routing/authentication passed 29 tests. Shared schema build/typecheck and OpenAPI, TypeScript and Kotlin generation passed. Nine questionnaire regressions passed. Existing large-web-bundle advisories remain.

Earlier evidence records 305 backend non-database files with 4,685 passing tests and one skip, plus focused real-PostgreSQL checks. This is not proof that the entire database suite is green: the full 103-file database sweep terminated without a final result. The existing pharmacology integration expectation of `null` versus returned `undefined` was reproduced in the original checkout. Backend typecheck reported the unrelated extensionless import in `apps/backend/src/schema/work.ts`. These are recorded observations, not checks rerun during this documentation audit. Android build/tests were not run because the Android SDK was unavailable. Generated Kotlin models are not evidence of a successful Android application build.

No real push notification was sent during reminder tests. Browser checks used disposable test data, or inspected the existing preview without saving changes, as described in those reports.

## Reproducible development commands

Run from the repository root with Node **26** (`engines.node` is `~26`) and the root package-manager declaration **pnpm 10.33.4**. `apps/web/package.json` retains an older pnpm declaration; use the root workspace commands consistently. Install dependencies before building the shared package:

```sh
pnpm install --frozen-lockfile
pnpm --filter @aurboda/api-spec build
pnpm --filter aurboda-web typecheck
pnpm --filter aurboda-web test
pnpm --filter aurboda-web build
pnpm --filter aurboda-backend exec vitest run --exclude '**/*.integration.test.ts'
pnpm --filter aurboda-backend check
pnpm --filter @aurboda/api-spec check
```

Set `TZ=UTC` for the backend test command when reproducing the recorded baseline; an existing correlation test assumes UTC. Database integration tests require a working container runtime accessible to Testcontainers and disposable PostgreSQL. Run focused integration files explicitly before attempting the much heavier full backend suite. `pnpm --filter aurboda-backend test` includes integration tests; it is not a unit-only command.

After API schema changes, use the actual package scripts:

```sh
pnpm --filter @aurboda/api-spec generate:openapi
pnpm --filter @aurboda/api-spec generate:ts
pnpm --filter @aurboda/api-spec generate:kotlin
pnpm --filter @aurboda/api-spec generate:docs
pnpm --filter @aurboda/api-spec build
```

The aggregate `generate` runs those four generators; `generate:html` is separate and used by the container build. Kotlin generation uses the OpenAPI generator CLI and its toolchain requirements. Root `pnpm test` runs backend, web and Android tests; root `pnpm build` builds web and Android. Android commands require a configured Java/Android SDK environment. Web-only validation should use the filtered commands above.

The verification session used installed binaries and temporary tooling because the host pnpm wrapper could not initialize its package store. `/tmp/` tool paths in session logs are environment-specific workarounds, not portable setup instructions.

## This installation and deployment

The deployment directory is the parent of this checkout, `foghouse-aurboda/`. Its `README.md`, `scripts/`, `quadlet/` and `systemd/` describe a rootless Podman installation. The installed runtime root is `/home/brighton/.local/share/foghouse-stats`; scripts use that absolute location. The regular build context is its `source/`, not this isolated `people-implementation/` checkout.

The application Quadlet uses local image `localhost/foghouse-aurboda:career` with `Pull=never`, service/container `foghouse-aurboda`, PostgreSQL container `foghouse-postgres`, and a loopback mapping `127.0.0.1:8818:80`. Public access is through `https://stats.foghouse.org`, with the tunnel targeting that loopback origin. Do not substitute upstream `aurboda.net` in private host/passkey settings.

The deployment operator recorded release `81e4a93` deployed and verified through both local and public `/api/status`; the previous application image was retained as `localhost/foghouse-aurboda:before-fixes-81e4a93`. This records the earlier deployment handoff. The subsequent child-guide release `eefee14` was verified locally and publicly on November 12; its backup and rollback reference are in [the release report](../people-verification/super-baby.md). The parent deployment README was updated during this documentation pass to reflect this handoff.

The Dockerfile builds shared API types and the web application, generates OpenAPI/HTML docs, and packages nginx with Node 26 running backend TypeScript directly. `entrypoint.sh` writes relative `/api` runtime configuration, starts the backend on port 3000 and nginx, and shuts down both if either process exits. The image health check requests `/api/status` through nginx; this checks more than static-file availability.

Configuration names verified in code/Quadlets include `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `SESSION_SECRET`, `WEB_HOST`, `API_BASE_URL`, `NODE_ENV` and `BUILD_SHA`. PostgreSQL initialization uses `POSTGRES_USER`, `POSTGRES_DB` and its password environment. Passkey overrides include `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME` and `WEBAUTHN_ORIGINS`. Optional notifications require all of `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_VAPID_SUBJECT`, plus the existing queue and a browser subscription. Missing optional push configuration is not a deployment-wide failure. Never copy secret values into documentation or logs; `runtime.env` is private and excluded from version control.

Read-only operational checks:

```sh
systemctl --user status foghouse-aurboda.service foghouse-postgres.service
journalctl --user -u foghouse-aurboda.service -n 100
curl -fsS http://127.0.0.1:8818/api/status
curl -fsS https://stats.foghouse.org/api/status
```

Review logs privately because they may contain operational data. The regular `scripts/update.sh` backs up, builds from installed `source/`, restarts the application and polls local health. Its checked-in `BUILD_SHA` argument is the fixed string `foghouse-career`; it does **not** automatically derive the Git commit. A successful ordinary update therefore does not by itself prove a precise release SHA. Keep source synchronization and release labeling explicit when planning the next deployment.

## Backup and rollback references

See the parent deployment README and `scripts/backup.sh` for the existing backup/restore procedure; no backup contents or user records were inspected for this audit. The script uses custom-format PostgreSQL dumps, validates each archive with `pg_restore --list`, and defaults to 365-day retention controlled by `FOGHOUSE_BACKUP_RETENTION_DAYS`. Restoring live data is a separate, deliberate operation, not part of documentation validation. A retained old application image alone does not roll back database migrations or restore data. Preserve the matching backup and inspect compatibility before any rollback.

See [People care implementation and Help Tree](../people-care.md) for temporary status episodes, consent-aware tracking, pregnancy timing, lifecycle preservation and current limitations.

### Temporary care expansion release

Commit `9835b5f` was deployed and verified November 12, 2026. It adds eight optional care contexts, 101 recommendations, consent-aware tracking, pregnancy milestones and the actual-catalog Help Tree. [Release verification](../people-verification/care-expansion.md) records tests, source limits, backup and rollback details; [implementation](../people-care.md) describes the extension points. The catalog totals 243 records and 86 sources. Earlier release counts above remain historical.

### Care ethics guide and current work

Application commit `f1d8fd1` is the preceding deployment recorded in [People care](../people-care.md); documentation commit `e6cd290` records that handoff. The report states 40 People UI tests, web typecheck, scoped lint, production image build and backup validation passed, with local and public status showing the application version. The previous image is retained as `localhost/foghouse-aurboda:before-ethics-f1d8fd1`. These are recorded release checks, not runtime probes performed during this audit.

That restart emitted a warning about changed service configuration on disk. The release intentionally did not run a blanket daemon reload while unrelated configuration work was present. Before a future restart or reload, inspect the intended Quadlet/systemd change and coordinate its owner; a successful application health check does not prove that every pending service-file edit has been activated.

The current working tree also contains another chat’s Resources and Treatments changes, including routes, navigation, Android embedding, shared schemas, authentication, configuration and pharmacology files. The private installed `source/` build context can independently be dirty. Never synchronize whole trees or use a destructive reset to make the two copies agree: identify the release files, preserve unrelated changes and explicitly label the image being built. The Help Tree graph follow-up is described in `docs/people-care.md`; its checks are recorded separately from the historical release evidence above.

## Audit scope and command provenance

This documentation pass inspected Git history/diffs, registered web routes, page/adaptor wiring, Android More destinations, root/backend/API package scripts, `.github/workflows/ci.yml`, and the parent deployment update/backup scripts. CI's Node job installs dependencies, builds the shared API package, runs `pnpm check`, backend and web tests, then the web build. Its Android job has separate toolchain setup and shared-model generation. Local generation alone still does not establish Android build success.

No runtime environment file, secret value, backup content or live database was read. No application test, deployment, restart or notification was triggered solely for this documentation audit. Link/path checks validate navigation, not production behavior. Work's missing Android destination and unregistered draft schema remain known limitations, not newly discovered implementations.

Graph release follow-up: `0acf375` was deployed after the documentation-only commit `00b1da5`. Build, validated backup, active service, matching local/public status versions and unauthenticated Help Tree rejection were verified. See [People care](../people-care.md) for rollback image and the pending unit-file warning. No full backend or Android suite was rerun for this frontend-only change.

### Resources web deployment follow-up

`resources-4ef0930b949e` was deployed November 12, 2026 with the shared Resources library. Both local/public status matched, anonymous metadata/content/uploads returned 401, the web route returned 200, four central tables were present, and persistent storage read/write passed. The Resources volume is now included in verified daily backups; the script briefly pauses/resumes the application for matching snapshots. The pending Quadlet change was activated with daemon reload. No APK update was needed. See [Resources](../resources.md) for scope, test limits, storage and rollback.

## Privacy, session and spouse follow-up

Commits `5044c73` (audit privacy/schema gate), `b23bb12` (account isolation), `d7b27e7` (spouse cards and optimistic edits), `a9aae41` (release provenance/source catalog/Work navigation) and `1d1b24d` (atomic Work saves) were deployed as `people-hardening-1d1b24d`. [Verification](../people-verification/hardening-marriage.md) records full web and backend unit checks, focused real-database suites, code generation, browser review and exact-version health probes. Read [local release traceability](foghouse-release-traceability.md) before using the parent update script; it now requires a reviewed release label. The original audit-only and older typecheck statements above are historical; the Work draft type error and Android source navigation gap are resolved, while Android SDK verification remains unavailable.
