# Publication checks — November 13, 2026

This is a documented snapshot of existing work. No feature was built for this publication, no live service was restarted, and no APK was distributed. It is not an all-green upstream contribution or release candidate.

## Source and privacy

- Parent: upstream `feae57c68351927f33e322d2c61841b4fed0132d`.
- The deployment source was compared with the separate development copy. The source contains the newer production code; the missing recurring-task release note was retained from development.
- A separate publication directory preserves both original working copies. All publication changes are documentation, ignore rules and release-workflow guards.
- New and changed text was reviewed for credential patterns and personal account records. The dashboard guide was rewritten to remove private links and personal tracking summaries. This is a bounded review, not a claim that a scanner proves absence of every possible secret.
- Runtime files, backups, nested agent state, generated output and raw verification artifacts are excluded. Historical feature test summaries are kept, with their limits.
- Original license and upstream authorship remain. New commits belong to the contributor, not the upstream author.

## Checks run on the publication copy

The existing local Node 26.13.0 and pnpm 10.33.4 toolchain and dependency installation were reused. This was not a clean dependency installation. Package dependency links were pointed at the publication copy's built shared API package.

| Check | Result |
| --- | --- |
| `pnpm --filter @aurboda/api-spec build` | Passed. |
| `pnpm check` | Backend TypeScript passed, then lint stopped the aggregate check with 1 error and 1,250 warnings. The error is duplicate imports from the test helper in `apps/backend/src/services/people-relationship-history.integration.test.ts`. Later package checks were not reached by this command. |
| `pnpm --filter aurboda-web test` | 1,750 passed; 1 failed because the sandbox denied `spawnSync` with `EPERM` in the DST subprocess test. 190 files passed, 1 failed. |
| `TZ=UTC pnpm --filter aurboda-backend exec vitest run --project unit-shared --project unit-isolated` | 4,154 passed, 715 failed, 3 skipped; 716 errors reported. Restricted socket creation (`listen EPERM`) affected route tests. This run does not establish that every failure is environmental or that the backend suite is green. |
| Database integration tests | Not run for publication. Historical real-database results are in the feature guides; they are not results from this snapshot's publication check. |
| Android build/tests | Not run; no Android SDK verification. Existing native source changes are not a shipped APK. |
| Deployment / phone delivery | Not performed. |

The first aggregate-check invocation lacked pnpm on its child-process PATH; it was rerun with the installed toolchain on PATH, producing the lint result above. No code fixes or broad formatting were applied to make this documentation/publication task look like a feature-development pass.

Before proposing an upstream merge, start from current upstream `develop`, isolate a small contribution, run `pnpm fix`, `pnpm check`, the relevant complete suites and Android CI where applicable, and follow the review gates in `AGENTS.md`. Do not bypass failed checks or describe the historical deployment tests as current CI.

## Excluded verification artifacts

Raw local test output and a verification screenshot are not part of the public repository. Feature guides retain their recorded summaries. Where they name local release records or old development commit hashes, those references describe the previous installation and are not promises that the referenced artifact or commit exists in this public branch.
