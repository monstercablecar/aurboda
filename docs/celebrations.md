# Temporary save celebrations

The shared `Celebration` component now has five catalog families. These are temporary acknowledgments of effort, without score judgments, health claims, storage, sound, canvas, or new dependencies. Existing Work callers retain their default 3.6-second treatment/work interface and confetti presentation.

| Family    | Placement and trigger                                                                        | Presentation                          | Lifetime    |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------- | ----------- |
| CPAP      | Import page, only after all upload batches succeed and at least one value is confirmed saved | Large teal moonrise banner            | 4.8 seconds |
| Big Five  | Successful IPIP-120 or IPIP-300 result save                                                  | Large violet constellation flourish   | 5.2 seconds |
| Reasoning | Successful Mensa or TestMyBrain result save                                                  | Medium amber popup and outward sparks | 4 seconds   |
| Quick     | Successful Human Benchmark save, including reaction time                                     | Small teal lower-corner toast         | 2.8 seconds |
| Check-in  | Existing Treatments success callback and other assessment saves                              | Medium violet confetti popup          | 3.6 seconds |

`components/celebration-catalog.ts` maps known instrument key prefixes to workload families, with a medium check-in fallback. Four distinct title/message pairs rotate per family in memory; a new event always has a new ID. Generic benchmark copy also fits memory and other Human Benchmark results. There is no elapsed-test-time inference. Only one effect is held by each page. Assessment category/format changes clear it; the existing session boundary remounts page state on logout/account changes.

CPAP parsing and partial/failed imports do not trigger an effect. Assessments trigger only after `submitAssessment` resolves, independently of history refresh; validation, deletion, and refresh do not trigger effects. Treatments retains ordinary feedback and uses its existing successful `celebrationMessage` signal to select catalog copy. No backend, game, navigation, or persistence behavior changed.

The overlay has no input-blocking backdrop. A labeled dismiss button is keyboard accessible; text is a polite live status. Ordinary success feedback avoids a second simultaneous status announcement. Reduced motion disables animation and decoration while retaining the readable acknowledgment and dismissal. There are at most 13 decorative particles, hidden from assistive technology. Animation changes only transform/opacity. Container-height units keep confetti travel relative to the overlay without Android WebView viewport-height units. Small-screen sizing and existing theme surface/text variables preserve readability.

## Local preview

Run the existing web development server and open `/celebration-preview.html`. Its separate `src/celebration-preview.tsx` entry imports the actual component and catalog, contains no API/auth imports, and is not routed, linked in navigation, or included in the default production build. Five family buttons, replay, and next-message controls demonstrate timing and copy. Effects are contained within a sample journal stage. The initial static card remains readable until an animation is requested.

## Verification — November 12, 2026

Toolchain: Node v26.13.0 from `/tmp/aurboda-quality-audit/node-v26.13.0-linux-x64/bin`, cached pnpm 10.33.4 invoked as `node /tmp/aurboda-work-toolchain/node_modules/pnpm/bin/pnpm.cjs`. Existing dependencies were reused. Generic `pnpm` resolved to an unsuitable Codex runtime wrapper and failed opening its SQLite store, so checks used the cached pinned executable.

- Scoped `node_modules/.bin/oxfmt` on the changed files passed. Repository-wide formatting was intentionally avoided to preserve concurrent work.
- `pnpm --filter aurboda-web typecheck` passed.
- Focused Vitest coverage: 4 files, 15 tests passed. Covers mappings/copy rotation, replacement timers/unmount cleanup, dismissal, CPAP preview/full/partial/failed saves, and assessment validation/failure/success with a failed history refresh.
- Full `pnpm --filter aurboda-web test`: 170 files passed; 1 failed. 1,639 tests passed; the one failing existing `utils/barWindows.test.ts` DST test could not spawn its child Node process (`spawnSync ... EPERM`). The initial run caught a viewport-height unit in the new confetti transform; it was corrected and the CSS guard passed on rerun.
- `pnpm --filter aurboda-web check`: typecheck passed; lint reported 278 warnings and one existing error in untouched `src/state/api/work.ts:20` (`eslint(curly): Expected { after 'if' condition.`). No unrelated lint cleanup was performed.
- `pnpm --filter aurboda-web build` passed, with the existing large-chunk advisory. The preview is excluded from the production entry.

No staging, commit, push, deployment, or production data access was performed.

## Deployed — November 12, 2026

User approved the preview and deployment. Release `foghouse-celebrations-20261112-01` is live at https://stats.foghouse.org. The deployment source matched the last release manifest before the 11 reviewed implementation/test/documentation files were copied; preview files were not copied. Existing deployment target files matched their pre-change baseline.

Production-copy shared API types were rebuilt to resolve stale local generated types from the preceding People release. Web typecheck then passed, all 15 focused celebration tests passed, and the full web suite passed: 171 files / 1,640 tests. The prior DST process-permission failure passed with appropriate process access. Existing unrelated Work lint issue remains as documented above.

The standard release script completed backup, image build, unchanged-source manifest verification, restart and exact-version health verification. Record: `releases/20261112T210529Z.foghouse-celebrations-20261112-01.1HM7hU`. Previous release: `people-history-70ae594`; retained rollback image: `localhost/foghouse-aurboda:before-celebrations-20261112` (image ID `f3589c9cfa6deadc3bf0b715650a24c1e9b80f41c56f570ba742df88a6c55086`).

Local and public `/api/status` reported the exact release and service was active. Public celebration catalog and CSS were downloaded and verified for all five families, the moonrise effect and reduced-motion support. No real user records were created for smoke tests; success/failure integration behavior was verified with mocked component tests and the local visual preview. Other possible celebration placements remain suggestions, not part of this release.

## Expanded completion placements — November 12, 2026

Five additional catalog families reuse the existing lightweight motion, themes, reduced-motion handling, dismissal, and 13-particle ceiling. Each family has four rotating supportive title/message pairs, with no score or health judgment.

| Family                 | Trigger                                                                                                       | Presentation                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `nutrition-daily`      | First successful nonempty Simple Food daily-check creation for the selected date                              | Small teal toast, 2.8 seconds          |
| `nutrition-assessment` | Successful completion of a new or draft detailed nutrition questionnaire, including both current longer forms | Large warm amber flourish, 4.8 seconds |
| `workday`              | Successful save when loaded day metrics and work entries establish that the day/profile has no saved record   | Small amber toast, 2.8 seconds         |
| `goal-complete`        | Explicit People goal creation as completed, or a saved transition from another status to completed            | Medium violet flourish, 4 seconds      |
| `import`               | Confirmed complete manual FIT batch, or the successful completed food-library job started in this panel       | Medium teal acknowledgment, 4 seconds  |

Simple Food captures the previous assessment identity/stage before awaiting the save. Draft saves, existing daily-check edits, corrections of already completed assessments, meal edits, empty saves, and failures remain ordinary feedback. An in-memory successful-date set prevents another daily celebration when refreshed data has not yet arrived. A current-date ref prevents an older in-flight save from celebrating on a newly selected date. This guard is component-local, not persistent storage.

Work uses the existing loaded queries to establish absence of a saved day, plus a component-local successful-save set so stale query data cannot trigger repeats. This is a UI acknowledgment, not an atomic server insert assertion: another client could save the same date after those queries load. Saves are matched against the current date/profile ref. Existing hiring celebrations retain priority; only one Work effect is displayed. Settings and ordinary repeat edits do not produce the new effect.

People captures the edited event and its old goal status in mutation variables. Only `type: goal` with a new `goal_status: completed` triggers the effect. Failed saves, already-completed corrections, notes, relationship-state changes, and automatic metric-goal calculations do not trigger it.

FIT imports require `success: true` and a nonempty set of identified activity records for every file. Empty responses, failed envelopes, thrown errors, and partially successful batches do not celebrate. The small `ImportCelebrationProvider` lives inside the existing keyed `SessionBoundary`: single-file navigation remains immediate while the acknowledgment survives navigation. Account/session changes remove the host state and its timer. Nothing is stored globally or persisted.

The food-library panel tracks the exact ID returned by its own start request and polls that job directly. Historical jobs on load, unrelated jobs, queued/running states, failed/empty jobs, and completed jobs with skipped items are silent. A terminal matched job is consumed once. Normal job status and errors remain visible. The library is a shared reference-data import, so generic import copy describes completion without implying personal health data or a score.

### Expansion verification

All edits were made in the current `source` checkout, preserving its existing People relationship-history and other pending work. Cached Node 26.13.0 and pnpm 10.33.4 were used with no dependency installation. Scoped `oxfmt`, web typecheck, focused component/regression tests, and production build were run. The focused tests cover existing families and copy rotation, daily creation/edit/repeat/failure, assessment draft/completion/failure, Work new/edit/failure/current-date behavior, People completion/failure/already-completed correction, FIT navigation/session remount/full/partial/empty/failure, library job matching/dedup/partial/failure, actual session-boundary cleanup, and the Android viewport-unit guard. Web typecheck passed; all 11 focused/regression files passed (83 tests); production build passed in 4.02 seconds with the existing large-chunk advisory. Logs: `/tmp/celebrations-expansion-tests.log` and `/tmp/celebrations-expansion-build.log`. This document does not claim deployment. The parent review handles the full web suite and authorized release.


### Expansion deployed — November 12, 2026

Release `foghouse-celebrations-20261112-02` deployed after user authorization. Full web suite: 175 files / 1,660 tests passed. Browser preview verified all five new families, including mobile layout at 360px. The reviewed manifest changes were the 15 implementation/test source files above plus regenerated local build output; no backend/schema change was introduced.

The standard update script completed a backup, image build, unchanged-source verification, restart and exact-version health check. Protected record: `releases/20261112T211608Z.foghouse-celebrations-20261112-02.Aikn53`. Retained rollback tag: `localhost/foghouse-aurboda:before-celebrations-expansion-20261112`, previous version `foghouse-celebrations-20261112-01`.

Both local and public status endpoints reported the exact new version. The service was active and the public entry bundle contained all five new celebration families. No production user entries were created for verification; success/failure behavior was exercised through the component tests. This supersedes the pre-deployment wording in the expansion verification section above.
