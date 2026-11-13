# Temporary care and Help Tree verification

Verified November 12, 2026. This extends the previously deployed child guide without replacing People storage, existing rules or logging.

## Delivered

- Eight optional dated status kinds, explicit resolution/archive/reactivation, preserved lifecycle history, pregnancy timing and loss-sensitive explicitly selected postpartum support.
- 101 new reviewed guidance records (54 general care, 47 pregnancy/postpartum), 44 source entries and 10 optional discussion milestones. Combined catalog: 243 records and 86 sources. See [evidence and empathy review](../people-care-evidence.md) for provenance and limitations.
- Optional care metrics in existing private observations, explicit sensitive-tracking agreement/provenance, episode-specific summaries and opt-in retention after resolution.
- Same server matcher for existing and new guidance, meaningful overlaps, safety priority, explicit preference-log conditions and deterministic deduplication.
- Dashboard care sections and ethics, status editor, seeded milestone/metric logging, and **View Help Tree** with searchable/filterable real catalog dependencies and server applicability explanations. No automatic notifications or pregnancy outcome transitions.
- Shared REST/MCP contracts and generated clients; existing Android embedded People surface receives the web functionality. No new database table or destructive migration.

## Validation

- Full web suite: **159 files / 1,569 tests passed**. Production web build and web typecheck passed. Build retains the existing large-bundle advisory.
- All People backend suites: **155 tests passed across 13 files**. One reminder integration cleanup hook exceeded its timeout after assertions passed; an isolated rerun passed all three tests and cleanup. This was not reported as a clean first run.
- Final episode-preservation regression suite: **21 tests passed**; final People UI suites: **40 tests passed**, including appropriate caregiving agreement wording.
- Further focused rule checks cover mixed `all` and same-episode predicates, unrelated-episode feedback, safety deduplication and unknown milestone timing. Real PostgreSQL lifecycle tests caught and fixed JSONB key-order-sensitive transition-history comparison.
- Shared typecheck and OpenAPI/TypeScript/Kotlin generation passed. Backend typecheck reports the existing unrelated `apps/backend/src/schema/work.ts:1` TS2834 extensionless import; Android SDK build/test was not run.
- Scoped lint had no errors; backend retained non-null assertion warnings. Whitespace checks and documentation link checks passed.
- Browser verification used a synthetic adult nonbinary spouse with pregnancy and anxiety in the isolated preview database. Verified combined support, 30-week timing, Spouse → Pregnancy → Third trimester filtering, keyboard focus/back navigation, milestone form context and explicit agreement/source selection, absence of irrelevant numeric fields, and a 390-pixel mobile layout. The synthetic fixture was removed after verification. No live person data was inspected or modified.

## Review boundaries

Sixteen ACOG sources were checked through official indexed excerpts after full-page access returned HTTP 402. Their metadata and UI say excerpt-only, not full-page verification. Supplemental sources were directly retrieved. Review is source checking and scenario-based empathy assessment by implementation agents, not independent clinical or human approval. Existing source quotations remain; new guidance uses concise paraphrases.

The [implementation guide](../people-care.md) documents intentional limits, data lifecycle, extension points and exact file paths. Existing request-audit retention of sensitive bodies remains a privacy consideration. Current feedback is not a full per-episode ledger, and outcome-only edits are not a separate immutable audit trail. No diagnostic predictions, high-risk treatment protocols or automatic family relationships were added.

Concurrent Treatments/pharmacology changes are excluded from this feature's commit and deployment patch. Deployment is recorded below only after verification.

## Deployment

Application commit `9835b5f` was deployed November 12, 2026 after successful standard database backups and archive validation. All 38 release files matched the synchronized customized `source/` checkout. Image `localhost/foghouse-aurboda:care-9835b5f` is active through the `career` tag; rollback image `localhost/foghouse-aurboda:before-care-9835b5f` retains the previous application. Both local and public `/api/status` returned success and version `9835b5f`; unauthenticated public `/api/people/help-tree` returned HTTP 401, and the user service was active. Production health/authentication were checked without reading private profiles.
