# Privacy, account isolation, Work and marriage follow-up

Verified November 12, 2026 against code commits `5044c73`, `b23bb12`, `d7b27e7`, `a9aae41`, and `1d1b24d`. No private production records or historical audit payloads were inspected or deleted.

## Delivered changes

- [Request audit privacy](../ai/privacy-hardening.md), failed-schema-check rejection/retry, and quarantine of the unused invalid Work schema.
- [Account isolation](../ai/account-isolation.md): fresh caches, retired callbacks, stale-response fencing, component remounts and cross-tab handling.
- [Marriage guidance](../people-marriage.md): 31 cards, eight optional spouse contexts, ten checked sources, safety exclusions and optimistic People edit checks.
- [Atomic Work saving](../work-day-saving.md): one REST/MCP transaction, stable canonical days and conservative history/draft handling.
- [Release traceability](../ai/foghouse-release-traceability.md): explicit labels, source manifests, exact-version checks and narrowed build context. Source catalog and Android Work navigation corrected.

## Checks

| Check                                        | Result                                                                                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full web suite                               | 166 files, 1,600 tests passed                                                                                                                                                                                                                      |
| Backend unit projects                        | 315 files; 4,806 passed, one skipped                                                                                                                                                                                                               |
| Privacy focused suite                        | 131 tests passed                                                                                                                                                                                                                                   |
| People catalog/rules units                   | 59 tests passed                                                                                                                                                                                                                                    |
| People disposable PostgreSQL suite           | 25 tests passed, including stale-edit conflicts                                                                                                                                                                                                    |
| Final Work disposable PostgreSQL regressions | 12 tests passed, including rollback, concurrent retry, tombstones, built-in/range rejection and notifier-after-commit                                                                                                                              |
| Work REST/MCP and web adapter                | Passed; web adapter two tests                                                                                                                                                                                                                      |
| Shared/backend/web type checks               | All passed                                                                                                                                                                                                                                         |
| Production web build                         | Passed; existing large-chunk advisory remains                                                                                                                                                                                                      |
| API generation                               | OpenAPI, TypeScript and Kotlin generated in an isolated package copy containing these changes; unrelated Resources additions excluded from these generation inputs. Required Kotlin fixups applied. Generated outputs are ignored build artifacts. |
| Release script                               | Syntax checks and seven stubbed tests passed; actual source-manifest dry run accepted                                                                                                                                                              |
| Browser review                               | Spouse and honeymoon branches, labeled breadcrumb, four connection cards and source edges verified against disposable preview; branch rail bounded to avoid excessive blank layout                                                                 |

Initial subprocess/server tests were attempted under restricted execution and failed on process/socket access; rerunning with the required local permissions passed. A newly added Work web test needed its browser test environment specified; the final full web suite above includes the corrected test.

Android SDK was unavailable: navigation source/test was added, but no Android app build, test run or APK deployment is claimed. The complete database suite was not rerun; the People/Work integrations above were targeted against disposable databases. Historical logs/backups and session-token expiry policy are unchanged. Remaining larger design limits are explicit in [technical debt](../ai/technical-debt.md).

## Deployment

Deployed release `people-hardening-1d1b24d` on November 12, 2026 through the reviewed local update script. The existing backup completed, source manifests before/after build matched, and the service restarted successfully. Local and public `/api/status` both returned that exact version; the service was active. Unauthenticated People Help Tree, Work save and Resources endpoints returned 401. A transient startup 502 resolved within the bounded health loop.

The prior Resources release was preserved as `localhost/foghouse-aurboda:before-hardening-1d1b24d`; the protected release record is `releases/20261112T195255Z.people-hardening-1d1b24d.JWtYTT` under the local installation. It contains source hashes, image IDs and backup verification output. The source copy retains the separately deployed Resources code; this release's scoped Git commits do not claim authorship of those uncommitted changes.

Only reviewed changes were applied to the customized source copy. Four shared API/MCP/schema entry points were verified byte-for-byte against the pre-change Resources baseline before copying their merged contents. No live profile was created or edited during release checks.
