# Customizable Tasks board

The private Tasks page offers List and Board views. Board settings are account-wide: projects filter one shared workflow rather than defining separate sets of columns. Tasks remain private to the signed-in account.

## Everyday use

Click a task title to edit it, or use its checkmark to complete/reopen it. The checkmark responds immediately while saving and returns to its previous state if the save fails. Open the card's **•••** menu for moving, ordering, duplication, archiving and deletion. **Select tasks** switches explicitly into bulk selection; completion controls are hidden while selecting.

Quick add accepts Enter and keeps focus ready for the next task. Search and label filters wait briefly while typing; columns retain their layout, collapse state and unfinished quick-add drafts. Previous results remain visible while replacement results load, with card actions temporarily disabled on those stale results. Active filter chips explain and remove individual filters. Saved views show their selected name and can be deleted individually.

The task editor starts with essential fields and a checklist. Repeat and More details expand on demand and are already open for populated existing data. Ctrl/Cmd+Enter saves. Invalid fields reveal their enclosing collapsed section. Full-screen mode supports Escape and restores focus; Escape inside an editor closes the editor first. The board respects reduced-motion preferences.

**Appearance** controls spacing/colors/descriptions; **Board settings** changes workflow columns. Column settings explain completion categories and optional task limits, validate limits before saving, and retain explicit reload/discard behavior for conflicting edits.

## Workflow and cards

Board settings can add, rename, reorder, recolor and remove columns, with up to 20 columns. Every column belongs to To do, In progress or Done, and each category must retain at least one column. These categories preserve completion and recurring-task behavior. Moving to Done completes a task; moving back reopens it. Move all tasks, including archived tasks, out of a column before deleting it or changing its category. Renaming, color and WIP changes preserve task placement.

Work-in-progress (WIP) limits are advisory. The board shows the total active task count for each column, including tasks excluded by the current search or project filter, and warns when the limit is exceeded. A limit never silently prevents a save. The displayed card count reflects the current filters. Columns load 20 cards per page.

Cards support descriptions, priority, due dates, recurrence, up to 20 labels, up to 100 checklist items, a blocked reason, and up to 20 named text custom fields. Use Edit to maintain these details; checklist progress and other metadata are visible on the card. Blocking is a visible flag, not a restriction on movement. Custom fields are per-task text values, not board-level typed field definitions.

Quick add creates a task directly in a column. Duplicate creates an open, non-repeating copy and resets checklist completion. Archive hides a task from the normal view without deleting it; use the Archive filter or the List view's Archived tasks option to find and restore it. Existing recurrence remains completion-triggered: archiving does not generate the next occurrence. A generated next occurrence retains labels and custom fields, resets checklist completion, clears its blocked reason and starts unarchived in the first To do column.

## Finding and moving work

Search covers titles, descriptions and labels. Board filters include priority, exact label, blocked tasks, due-date range and archive state. Sorting supports manual order, due date, priority, newest, oldest and title. Filtering and sorting happen on the server before pagination.

Use a card's Move to menu for keyboard/touch movement, or drag by its handle. Manual sorting supports dropping before another card and moving up/down. Ordering reads the target column to find a position; older equal positions can require a series of version-checked updates. A concurrent edit can interrupt that sequence, so partial changes are reported and the board refreshes rather than overwriting newer content.

Select cards to move, archive or restore several tasks. Bulk changes are individually version-checked, not an atomic transaction; the result reports successes and failures. Retry a failed task after refreshing its latest state. Changes accepted by the server remain saved if the page or account is changed during a request.

Named saved views retain board filters and sort in this browser for this account. They do not contain task data or tokens and do not sync between devices. Search text and project selection are separate controls. Density, accent and description visibility use the existing [appearance preferences](kanban-appearance.md). Clearing browser storage removes these local preferences. Column settings and card details are stored in the account database and included in account SQL exports and database backups.

## Implementation and compatibility

Shared contracts live in `packages/api-spec/src/schemas/native-tasks.ts`. The existing Tasks REST routes and MCP tools support new metadata and query filters; board configuration adds GET/PATCH `/tasks/board` and corresponding MCP tools. The per-user `task_board_settings` singleton holds columns and a version timestamp. All task writes coordinate through the board row so a column cannot disappear during a move. Stale settings and task updates return conflicts instead of overwriting newer changes.

Existing task rows need no destructive migration. A task without a column ID resolves to the first column matching its completion category; configuration changes materialize these legacy assignments before reordering. New metadata defaults are supplied for old rows. Existing `done` and `workflow_status` clients remain supported. The new table is additive. Android code was not redesigned; this is the private web Tasks experience.

## Scope

This release focuses on private task management. It does not add shared team boards, assignees, permissions, attachments, comments, dependencies, automation rules, time tracking, timeline/Gantt views, or cumulative-flow/cycle-time reporting. Those require additional product and data-model work; the board is not a claim of complete Jira or Trello parity.

Capability references reviewed November 12, 2026: [Jira kanban boards](https://www.atlassian.com/software/jira/features/kanban-boards), [Trello custom fields](https://support.atlassian.com/trello/docs/using-custom-fields/), [Trello board filters](https://support.atlassian.com/trello/docs/filtering-for-cards-on-a-board/), and [Trello checklists](https://support.atlassian.com/trello/docs/adding-checklists-to-cards/). These inform the feature selection, not implementation compatibility with those products.

Verification: 1,712 web tests; 4,868 backend unit tests (one skipped); 32 focused PostgreSQL integration tests, including export/restore. Web/backend typechecks, scoped lint and production build passed; OpenAPI/TypeScript/Kotlin generation completed. The actual deployment source passed isolated real-database desktop/mobile browser flows for custom columns, WIP warnings, settings edits, rich card editing, Inbox quick add, saved views across reload, filtering, bulk archive/restore, movement/manual ordering and full screen. Android SDK tests were not run. Deployment status is recorded in the installation release log.
