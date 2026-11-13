# People implementation verification

Implemented in the existing customized Aurboda application, in isolated checkout `people-implementation`, branch `feat/people`. The original `source` checkout and running instance are unchanged. This report does not claim a production deployment or a fully green repository.

## Delivered

Private person CRUD for exactly five relationships; empty initial state; approximate age or birth date; independent needs, statuses, goals and interests; optional local photo; native navigation and Android embedded entry; server-composed contextual dashboards; editable timestamped observations; optional per-person metrics; non-overlapping shared-time totals; contextual sources and reasons; full applicable-catalog exploration and feedback; profile recomposition without history loss; cascading permanent deletion; optional reminders on the existing pg-boss/browser-push infrastructure.

Authoritative logic is in backend services. Calendar age, corrected age, life stage, eligibility, source selection, priorities, metric definitions, feedback expiry and aggregates are computed server-side. CDC monitoring and WHO support guidance retain different scopes. No diagnostic labels, relationship scores, fake observations, runtime AI or external recommendation API were added.

The catalog has **103 distinct records and 29 sources**: CDC, WHO, AAP/HealthyChildren, NIH/NIA and the Like Switch publisher, with evidence classifications. [Coverage and source inventory](../people-catalog-coverage.md) provides actual counts, applicable populations, dates and limitations. The smaller verified catalog intentionally does not meet the aspirational 150-record count. Source checks are development-time only.

## Checks and outcomes

All commands used Node 26.13.0. Installed tools were called directly because the host pnpm wrapper attempted unavailable package-store initialization. Existing declared web-push dependencies were installed into a temporary dependency directory for the isolated test checkout; no dependency manifest or lockfile change was needed.

| Check                                                                                      | Outcome                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full backend non-database suite: `vitest run --exclude '**/*.integration.test.ts'`, TZ=UTC | **305 files passed; 4,685 tests passed; 1 skipped**                                                                                                                               |
| Full web suite: `vitest run`                                                               | **153 files; 1,520 tests passed**                                                                                                                                                 |
| Final People service database suite                                                        | **12/12 passed** against real disposable PostgreSQL                                                                                                                               |
| Reminder database suite                                                                    | **3/3 passed**, including concurrent claims, stale corrections, retry and cascade cleanup                                                                                         |
| Native custom metrics database suite                                                       | **3/3 passed**                                                                                                                                                                    |
| Existing time-series database suite                                                        | **46/46 assertions/tests passed** in the focused database run                                                                                                                     |
| Catalog validation/acceptance                                                              | **10/10 passed**, included in backend total                                                                                                                                       |
| Shared schema build and typecheck                                                          | Passed                                                                                                                                                                            |
| Web typecheck and production build                                                         | Passed; existing >500 kB bundle warning remains                                                                                                                                   |
| REST/MCP parity and authorization tests                                                    | Passed, included in backend total                                                                                                                                                 |
| Scoped new/changed code lint                                                               | Zero errors; backend non-null assertion warnings remain                                                                                                                           |
| OpenAPI JSON/YAML, TypeScript and Kotlin model generation                                  | Completed; generated outputs follow existing ignored-artifact conventions                                                                                                         |
| Repository backend typecheck                                                               | Blocked by pre-existing `apps/backend/src/schema/work.ts:1` invalid extensionless import; original file preserved                                                                 |
| Existing treatment integration                                                             | **1 passed / 1 failed**: expected null but received undefined for cleared context-event intensity. Reproduced identically in untouched original checkout; not a People regression |
| Entire 103-file database sweep                                                             | Attempt ended with termination signal before reporting results; no claim of full database-suite completion                                                                        |
| Android build/tests                                                                        | Not run: Android SDK unavailable                                                                                                                                                  |

Early restricted-environment HTTP/subprocess failures were rerun with the permissions needed for local test servers. Initial People failures involving defaulted partial updates and historical metadata were corrected and the final 12-case database run passed. A large combined database run also hit cleanup-hook timeouts; independent final People and reminder runs completed cleanly. The existing correlation baseline test assumes UTC, so backend runs were pinned to UTC rather than altering application code.

## Actual browser verification

Used the real People router/services with a disposable PostgreSQL database and test-only login adapter, not production data. Verified the exact empty state; creation of the specified three-month-old; CDC two-month/four-month context; responsive interaction and supervised play guidance; optional observation persistence; age edit to nine years; server removal of infant controls; history preservation; and mobile layout at 390 × 844 with no horizontal overflow. Mobile screenshot (local verification artifact; excluded from public source) shows the resulting nine-year-old dashboard. Other relationship scenarios, deletion/recreation and owner isolation are covered by automated tests.

No real browser push notification was sent. Scheduling/delivery is exercised with injected delivery dependencies and real database claims. [Reminder documentation](../people-reminders.md) explains configuration, timezone behavior, retries and best-effort delivery limits.

## Remaining limits

- The catalog has documented content gaps, especially ages six–eight, individualized disabilities, detailed care protocols, jurisdiction-specific prevention and empirically validated romantic interventions. No unsupported claims were added to fill those gaps.
- Native globally shareable metrics lack per-person privacy. People uses private owned projections rather than exposing observations through that registry; native cross-dashboard analytics are therefore not integrated.
- Age transitions use UTC calendar dates. Reminder scheduling retains an explicit IANA timezone and absolute instant.
- Customization controls reference-area visibility and individual metric visibility; applicable evidence remains accessible in Explore.
- Notifications require existing VAPID configuration, the shared scheduler and the user's browser subscription. Provider acceptance is not a delivery receipt.
- Full database sweep and Android validation remain incomplete, and the two independently identified baseline issues above remain untouched.

## Changed implementation files

- `README.md`
- `apps/android/app/src/main/java/net/aurboda/ui/screens/MoreScreen.kt`
- `apps/android/app/src/test/java/net/aurboda/ui/screens/MoreScreenTest.kt`
- `apps/backend/src/api.ts`
- `apps/backend/src/api/rest-routes.ts`
- `apps/backend/src/db/browser-push.ts`
- `apps/backend/src/db/people-reminders.integration.test.ts`
- `apps/backend/src/db/people-reminders.ts`
- `apps/backend/src/db/people.ts`
- `apps/backend/src/mcp.ts`
- `apps/backend/src/mcp/people-tools.test.ts`
- `apps/backend/src/mcp/people-tools.ts`
- `apps/backend/src/routes/people-router.test.ts`
- `apps/backend/src/routes/people-router.ts`
- `apps/backend/src/schema.ts`
- `apps/backend/src/schema/people.ts`
- `apps/backend/src/services/browser-push.ts`
- `apps/backend/src/services/people-catalog.test.ts`
- `apps/backend/src/services/people-catalog.ts`
- `apps/backend/src/services/people-catalog/guidance.ts`
- `apps/backend/src/services/people-catalog/sources.ts`
- `apps/backend/src/services/people-notification-worker.test.ts`
- `apps/backend/src/services/people-reminders.test.ts`
- `apps/backend/src/services/people-reminders.ts`
- `apps/backend/src/services/people-rules.test.ts`
- `apps/backend/src/services/people-rules.ts`
- `apps/backend/src/services/people.integration.test.ts`
- `apps/backend/src/services/people.ts`
- `apps/web/public/notification-sw.js`
- `apps/web/src/components/nav-links.test.ts`
- `apps/web/src/components/nav-links.ts`
- `apps/web/src/index.tsx`
- `apps/web/src/pages/People/Dashboard.tsx`
- `apps/web/src/pages/People/EventForm.tsx`
- `apps/web/src/pages/People/Guidance.tsx`
- `apps/web/src/pages/People/People.test.tsx`
- `apps/web/src/pages/People/PersonForm.tsx`
- `apps/web/src/pages/People/PhotoField.tsx`
- `apps/web/src/pages/People/index.tsx`
- `apps/web/src/pages/People/style.css`
- `apps/web/src/pages/People/ui.tsx`
- `apps/web/src/state/api/index.ts`
- `apps/web/src/state/api/people.ts`
- `apps/web/vite.config.ts`
- `docs/data-sources.md`
- `docs/people-catalog-coverage.md`
- `docs/people-reminders.md`
- `docs/people.md`
- `packages/api-spec/src/openapi.ts`
- `packages/api-spec/src/people-paths.ts`
- `packages/api-spec/src/schemas/index.ts`
- `packages/api-spec/src/schemas/people.ts`

Verification logs and the mobile screenshot are stored alongside this report. Architecture is documented in [People](../people.md).
