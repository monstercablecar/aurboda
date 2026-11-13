# Native Tasks

Implemented and verified November 12, 2026; release verification follows below. Tasks is native to the customized Aurboda application, inspired by Vikunja workflows. No separate service, companion account, upstream source code or assets are used. Kitchen/recipe/meal-planning work was paused at the user’s request before deployment; its draft is preserved outside the production source.

## User experience

Tasks replaces the primary Goals navigation destination. Its private inbox, projects, title/details, due dates, priorities, completion/reopening, search and status filters work within the existing Foghouse login and theme. Health goals remains a secondary tab with the original metric/measure/trend targets, rolling windows and history. Existing goal links with history/new/range/embed retain their original meaning. Native Android code/APKs and existing meal logging/Simple Food are unchanged.

## Ownership and contracts

Records live in each account’s own database (`task_projects`, `task_items`), not the central shared Resources library. Existing account authentication, write restrictions, session isolation, account export and database backup boundaries apply. Edits and deletes use updated_at version checks to reject stale writes. Completing a task records its completion time; reopening clears it. Due dates remain local calendar dates. Nonempty projects cannot be deleted until tasks are moved or removed.

REST `/tasks/projects` and `/tasks/items` and corresponding MCP tools call the same services. Tasks provides list and Kanban workflows; it does not implement Vikunja’s Gantt or recurring-task ecosystem. No automatic conversion from metric goals to tasks occurs.

## References

[Vikunja features](https://vikunja.io/features/) informed the project/task organization and completion workflow. Its v2.8.0 AGPL license was reviewed during research, but no upstream code was copied. Native implementation follows Aurboda’s existing licensing and stack.

## Verification

Final task-only checks:

- Full web suite: 180 files, 1,674 tests passed.
- Full backend unit suites: 317 files, 4,838 passed, one existing skipped test.
- Task PostgreSQL integration: eight tests passed, including account isolation, CAS edits, lifecycle/null semantics, project protection and absence of Kitchen tables.
- Account export/restore: two tests passed with projects/tasks and cross-account exclusion fixtures.
- Exact production source: api-spec build/OpenAPI generation, frontend/backend typechecks and production web build passed. Existing large-bundle warning remains.
- Browser tests against actual disposable PostgreSQL storage: project/task creation, completion/reopening, legacy health-goal URLs, embedded health route, mobile dark layout, no Kitchen navigation. Visual review corrected mobile page sizing and action placement. No real production user records were used as fixtures.
- Source manifest comparison confirmed all non-generated changes since the previous release are in the reviewed Tasks file list. Simple Food, Meals, public login/signup and native Android files are unchanged by this release.

The earlier combined Kitchen/Tasks draft was never deployed. It is retained in the parent installation’s `drafts/kitchen-paused-20261112/`; do not apply its whole patch over the Tasks-only release when resuming.

## Live release

Deployed `foghouse-tasks-20261112-01` to https://stats.foghouse.org on November 12, 2026. The standard backup completed, the build source manifest remained unchanged during the build, and the exact version health check passed. Record: `releases/20261112T224512Z.foghouse-tasks-20261112-01.ycOPMn` in the parent installation. Prior release `treatments-audit-20261112-02` is retained as `localhost/foghouse-aurboda:before-tasks-20261112`.

Live desktop/mobile browser checks passed: Tasks route loads; Health goals remains available; public Aurboda login/dark presentation remains; no browser page errors. Anonymous task/project/goal APIs return401, Kitchen API returns404, signup remains invite-only. Signed-in mutations were exercised against isolated real database storage before deployment, not real production user accounts. The disposable browser-test database was removed afterward. One broad combined-scope integration attempt was interrupted when the user paused Kitchen; no passing result is claimed for that attempt.

## Kanban board

Tasks offers List and Board views. The board has To do, In progress and Done columns; drag a card by its handle or use its Move to menu on touch/keyboard. Search and project selection apply to every column, each with its own total and pagination. Both views use the same saved tasks. The editor also exposes status; list checkboxes still complete/reopen tasks.

`workflow_status` is `todo`, `in_progress` or `done`. Older JSON records are normalized when read (completed tasks → Done, other older tasks → To do), without a destructive database migration. Explicit status changes keep `done` and `completed_at` consistent. Legacy `done: false` keeps an already In progress task there, while reopening a completed task sends it to To do. Same-status edits preserve completion time. Conflicting status/completion PATCH values are rejected. REST and MCP share these rules, and column filtering normalizes older records identically.

Drag operations capture the original task version; conflicting edits return 409 and refresh the board. Filters, view changes and session changes cancel local drags. Each column loads independently so larger lists cannot hide other statuses.

### Kanban verification (November 12, 2026)

- Full web suite: 182 files, 1,685 tests passed.
- Full backend unit suites: 317 files, 4,844 passed and one existing skipped test.
- Real PostgreSQL Tasks integration: 12 passed, including legacy records, every workflow transition, column count/pagination, stale edits and account isolation.
- Export/restore: two passed, including Done and In progress task payloads and project links.
- Real-database browser checks passed for desktop drag/drop, reload/list consistency, stale drag 409, 22-task column pagination, moving last-page items, search reset, mobile Move to controls and original Health goals routes.
- Review identified and fixed cache refresh when changing views during a pending move; regression tests cover same-session unmount and old-session isolation.
- Exact deployment source typechecks and web production build passed. Existing bundle-size warning remains. Initial local checks hit restricted test networking/missing local Games dependency links; reruns with test networking and existing installed dependencies passed. No APK changes or destructive database migration.

Verification artifacts are in the parent installation’s `verification/kanban-20261112/`.

### Kanban live release

Deployed `foghouse-kanban-20261112-01` on November 12, 2026. Protected record: `releases/20261112T230347Z.foghouse-kanban-20261112-01.lIKCbN`. The standard backup completed, the source manifest stayed identical through the build, and the exact-version health check passed. Image: `39548795b975cd20f7ba6914aeda7b3ec54bd0d60e671e046f391aaa7b14b19b`. Prior running Tasks image `add46846169c031ed31da2342ee72b28fdf69341c0ae9228d60cd0c08041a530` was retained as `localhost/foghouse-aurboda:before-kanban-20261112`; its ID matches the release’s previous-image record.

This combined release also contains the separately authorized/reviewed arcade changes (`d243ed3`). Compared with that reviewed arcade build input, all additional non-generated changes belong to the explicit Kanban file list. The prior arcade attempt had safely refused restart after detecting concurrent Kanban source changes. This successful build used a stable combined tree.

Live public checks passed at desktop and mobile widths: expected release, original dark Aurboda login, Tasks and Health goals routes, no page errors, invite-only signup and authenticated task APIs (anonymous 401). Kitchen remains absent (404).

The deployed public browser bundles also passed the full Kanban desktop/mobile scenario against an isolated local real PostgreSQL API fixture (production assets, fixture account/storage). This verifies shipped UI behavior without changing production user records; it is not a claim of signed-in mutations against the production database.

## Recurring tasks

The web task editor offers Repeat: None, Daily, Weekly or Monthly. Repeating tasks require a calendar due date; selecting a repeat supplies an editable local-today default when none exists. Start a new repeating task open, then complete it using the list checkbox, editor or board. Completion preserves the original task in Done and creates one new To do task with the same project, title, details, priority and repeat setting.

The next date follows the scheduled due date: one calendar day, seven days, or one calendar month. Late completion can therefore produce an overdue next task; it does not silently skip occurrences or shift the routine to completion day. Monthly dates clamp to a shorter month's final day while retaining the original day (January31 → February28 → March31). Calendar arithmetic avoids daylight-saving hour shifts. Editing the upcoming due date or repeat changes its future schedule; resaving unchanged dates preserves the monthly anchor.

Set Repeat to None on the upcoming task to stop future occurrences. A completed occurrence retains a permanent next-occurrence marker, so reopening and completing it again cannot produce a second successor—even if the first successor was deleted. Editing a historical occurrence does not rewrite an already created next occurrence. Each occurrence remains an ordinary private task, visible in List and Board; there are no background jobs or native APK changes.

REST and MCP accept nullable `recurrence` (`daily`, `weekly`, `monthly`, or null); omission on update preserves it. Responses include `recurrence` and read-only nullable `next_occurrence_id`. Existing records normalize both to null without a table migration. Monthly anchor and successor marker are kept in the per-user JSON payload and preserved by export/backup. Completion and successor insertion share the existing version-checked transaction; failed/stale writes cannot leave a partial occurrence pair.

### Recurrence verification (November 12, 2026)

- Full web suite: 182 files, 1,693 tests passed.
- Full backend unit suites: 318 files, 4,863 passed and one existing skipped test.
- Real PostgreSQL task/recurrence suites: two files, 27 tests passed, including legacy records, atomic copying, duplicate/reopen/deleted-successor protection, month-end anchors, final merged project/schedule, forced rollback and account isolation.
- Focused recurrence/service unit tests: 35 passed, including leap years, calendar boundaries and date overflow.
- Export/restore: two passed with completed monthly occurrence, successor link and monthly anchor preserved.
- Exact deployment-source API build/OpenAPI, backend/web typechecks and production web build passed; existing large-bundle warning remains.
- Browser with disposable real PostgreSQL: daily list completion, weekly editor completion across year boundary, monthly actual drag/drop, January31→February28→March31 through a details-only edit, reload persistence and mobile recurrence stop. No page errors.
- Review caught a parent/task lock inversion during simultaneous completion/editor saves. Parent validation now uses compatible KEY SHARE locks while the task retains its version-checked row lock. The controlled regression passed after correcting PostgreSQL statistics snapshot refresh in the test observer.

Artifacts are in parent `verification/recurring-tasks-20261112/`. No production user data was used for fixtures. No new dependency, database table or APK change.

### Recurring Tasks live release

Deployed `foghouse-recurring-20261112-01` on November 12, 2026. Protected record: `releases/20261112T232817Z.foghouse-recurring-20261112-01.x4QtDf`. Standard backup, stable before/after source manifest and exact-version health all passed. Image: `174f01f0235045869407583a619ddd4b86d10014d9a45f32173dd6defe9bd759`. Previous Kanban image `39548795b975cd20f7ba6914aeda7b3ec54bd0d60e671e046f391aaa7b14b19b` is retained as `localhost/foghouse-aurboda:before-recurring-20261112`. Only reviewed recurring-task files changed from the previous release; existing Arcade and other features remain in the base.

Live desktop/mobile public checks passed: expected release, dark Aurboda login, original Tasks/Health goals routes, no page errors, invite-only signup and anonymous task/project/goal API401. Kitchen remains404. The deployed public browser bundles also passed the full recurring-task scenario against an isolated real PostgreSQL API fixture. This checks shipped UI behavior without changing production user records; signed-in production database mutations were not used as tests. The disposable fixture database was removed afterward.

## Customizable board expansion

See [Customizable Tasks board](ai/kanban-workflows.md) for configurable columns and WIP limits, labels/checklists/custom fields, archive/restore, manual ordering, bulk actions, saved filter views, persistence boundaries and compatibility. This section documents the implementation; deployment evidence is recorded with the release verification.
