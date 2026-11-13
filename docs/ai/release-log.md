# Foghouse release log

This ledger supplements the protected deployment records; it is not a substitute for them. Older releases remain documented in their feature guides and installation `releases/` records. See [release procedure and rollback](foghouse-release-traceability.md).

For each release, record the label, implementation revision or reviewed source manifest, user-visible changes, validation, backup completion, health result and previous live version. A failed build or source copy is never a successful release. Do not include credentials, private database names, backup contents or user records.

## November 12, 2026 — Foghouse arcade

Implementation: `d243ed3`; [feature and protocol reference](foghouse-games.md).

Changes: Home memory/reaction mini-games with a neon interface, randomized versioned protocols, separate Foghouse assessment metrics and raw trials, explicit account-safe saving, cancellation handling, and mobile layout. Instructions are inside How to play; dependency notices remain distributed without a game-panel link. No new database migration.

Verification: 36 focused tests, typecheck, lint and production frontend build passed. Disposable real-API/database roundtrips preserved results and distinct metric projections. Browser checks covered desktop/mobile rendering, memory transitions, reaction input, saving and cancellation. Actual jsPsych virtual-clock tests covered full-duration completion. No clinical validation or native Android build is claimed.

First attempt: `foghouse-arcade-d243ed3`, record `20261112T225750Z.foghouse-arcade-d243ed3.PUw7Nv`. Backup completed and image built, but the source-manifest check detected concurrent Kanban changes and refused the service restart. This attempt did **not** deploy. The previous live release at that point was `foghouse-tasks-20261112-01`. The failed build changed the shared image tag; its `previous-image-id` is the pre-attempt rollback reference, not a later lookup of that mutable tag.

### Successful combined release

Live label: **`foghouse-kanban-20261112-01`**. Record: `releases/20261112T230347Z.foghouse-kanban-20261112-01.lIKCbN`. This contains the arcade above plus the separately requested [Tasks Kanban board](../native-tasks.md), including To do/In progress/Done, drag-and-drop, a touch/keyboard move menu and preserved List view.

The combined deployment-copy type/build and real-database Kanban browser checks passed. The release manifest retained every reviewed arcade file. A fresh backup completed; source hashes remained stable through the build; the exact-version health check passed. Independent public requests confirmed the live label, arcade HTML/JS/CSS and401 protection for private assessments. The previous live release was `foghouse-tasks-20261112-01`; the recorded previous image matches the prior running container and remains present locally. No production user data was used for game testing.

The arcade chat's additional deploy attempt encountered the update lock and did not start another release; the successful combined release above is authoritative.

## Backup assurance and remaining operational work

The inspected installation backup script uses restrictive file permissions, dumps all matching Aurboda databases, checks dump readability with `pg_restore --list`, and includes the Resources file volume when present. It pauses application writes while capturing matching database/file snapshots and publishes completed files only after checks. Retention defaults to 365 days and can be overridden; that default is not proof of the effective configured policy.

Archive-readability checks do not prove a full service restore. Account export/restore integration tests use disposable databases and are separate from a full production-backup recovery drill. Off-site copies, backup encryption, scheduled backup coverage and a recent full recovery drill have not been verified in this arcade deployment audit.

Recommended next hardening: build each release from an immutable reviewed snapshot, and capture the running container's image as the rollback reference rather than relying only on the mutable shared image tag. The current manifest guard detects concurrent source edits and refuses restart, as demonstrated above; it does not prevent those edits.

## November 12, 2026 — Tasks Kanban and reviewed Arcade

Release `foghouse-kanban-20261112-01`, protected record `20261112T230347Z.foghouse-kanban-20261112-01.lIKCbN`, source manifest `7cedd8784363db284c336f6cdb53d29d75fc23fd90f103bdde01565d0ead4682`. Standard backup, stable build input, service restart and exact-version health succeeded. It includes the separately authorized Arcade changes above plus the reviewed Tasks board. Before deploying, the actual running Tasks image was tagged `before-kanban-20261112` and restored to the build tag so the previous-image record identifies the real running release, not the unshipped Arcade attempt.

Tasks gains List/Board views, three saved workflow statuses, drag/drop and accessible Move to controls. Existing legacy task completion and Health goals are preserved; no destructive migration/APK update. Full web1,685 and backend unit4,844 passed (one skipped); real task database12 and export/restore2 passed. Desktop/mobile real-database browser tests cover drag/drop, conflicts, pagination, persistence and routes. Public status/login/private API checks passed. See [native Tasks](../native-tasks.md) and parent `verification/kanban-20261112/`.


## November 12, 2026 — Recurring Tasks

Release `foghouse-recurring-20261112-01`, record `20261112T232817Z.foghouse-recurring-20261112-01.x4QtDf`, source manifest `f3b92ec497f664dac50c3ec3c5bf0e74f2955f0d84fa14914919dedecb8598bc`. Backup, stable build input and exact-version health succeeded; previous running Kanban image retained as `before-recurring-20261112`.

Daily/weekly/monthly task repeats schedule one successor on completion, retain history and preserve month-end anchors. No new table, dependency or APK change. Full web 1,693/backend unit 4,863 passed (one skipped); PostgreSQL task suites 27 and export/restore 2 passed. Review found and fixed parent/task lock inversion with a controlled race regression. Deployed public browser assets passed recurrence desktop/mobile flows against isolated real storage; public login/private API gates remained intact. See [native Tasks](../native-tasks.md) and parent `verification/recurring-tasks-20261112/`.



## November 12, 2026 — customizable Kanban

`foghouse-kanban-pro-20261112-01` deployed with custom account-wide columns/WIP warnings, rich task details, filters and local saved views, ordering, archive/restore, duplication and bulk actions. Web 1,712 tests, backend units 4,868 (one skipped), PostgreSQL 32 including export/restore passed. Typechecks, scoped lint, API generation and production build passed. Installed browser bundles passed desktop/mobile workflows against isolated storage; no live task records were used. Standard backup/stable manifest/local and public exact-version health passed. Anonymous board API returned 401. Rollback image: `localhost/foghouse-aurboda:before-kanban-pro-20261112`. Protected record: `20261113T003231Z.foghouse-kanban-pro-20261112-01.DJMEe6`. See [workflow guide](kanban-workflows.md) and installation `verification/kanban-pro-20261112/`.


## November 12, 2026 — Kanban usability

`foghouse-kanban-ux-20261112-01` is live with simpler task cards/editors, clear completion versus selection, focused quick add, stable filtering/drafts, background refresh, keyboard/full-screen improvements and compact board layout. All 1,727 web tests passed; typecheck/scoped lint/build and installed-bundle desktop/mobile browser fixtures passed. No backend/schema changes or production task edits. Standard backup/stable source manifest/local and public version checks passed. Rollback: `localhost/foghouse-aurboda:before-kanban-ux-20261112`; protected record `20261113T013714Z.foghouse-kanban-ux-20261112-01.hOQQKx`. See installation `verification/kanban-ux-20261112/README.md` and [workflow guide](kanban-workflows.md).
