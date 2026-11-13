# Atomic Work day saving

The Work page keeps its existing generic time-series, notes and `work_entry` activity storage. Daily saving now goes through authenticated `POST /work/days` or MCP `set_work_day`, both calling `services/work-day.ts:saveWorkDay`. There is no new Work profile table or migration. Work profile configuration remains in user settings; the former unregistered draft schema is not used.

## Contracts and calculations

[Shared schema](../packages/api-spec/src/schemas/work-day.ts) accepts the profile ID, calendar date, explicit timestamp, grid values, computed totals and note. The server loads that user's stored profile and derives storage names/source from it, including archived rows/columns when historical days are edited. Unknown rows/categories, extra/incorrect totals, non-finite/negative values and configured metric range violations are rejected. A missing legacy settings object resolves the built-in Recruiting profile; it does not authorize arbitrary profile IDs.

[work-profile.ts](../packages/api-spec/src/work-profile.ts) contains the existing pure profile/settings logic, re-exported by the web settings module. [work-day-model.ts](../packages/api-spec/src/work-day-model.ts) contains the existing Recruiting formulas and shared `computeWorkDayTotals`, used by both browser and server. Historical metric identities, source `career_tracker`, and day marker semantics remain intact. Cosmetic renaming never changes the stored identifiers.

## Transaction and idempotency

[Service](../apps/backend/src/services/work-day.ts) uses `withUserTransaction`; every read/write in [db/work-day.ts](../apps/backend/src/db/work-day.ts) uses that same transaction connection. A transaction advisory lock keyed by profile/date serializes same-day saves within the owner database. The transaction loads configuration, finds the canonical activity, validates/writes metric points and definitions, updates owned notes, and creates/updates the activity. A failure in any of these steps rolls back all of them.

A new activity gets a deterministic external ID derived from profile/date. Existing canonical IDs and timestamps are preserved, including legacy default Recruiting entries without explicit profile IDs. Existing noncanonical historical activities are not deleted. Deleted/superseded activity records and soft-deleted metric conflicts produce errors rather than silent resurrection or false success. Repeated/concurrent saves do not create additional canonical activities or note pairs.

After commit, the existing activity notifier runs through REST/MCP dependency wiring, preserving deduction/autoshare notification behavior. A notifier failure is safely audited and cannot roll back an already committed day; the save remains successful. Notifications and external job processing are not part of the PostgreSQL transaction or an exactly-once delivery guarantee.

## Dates and legacy ambiguity

New days preserve the browser's explicit noon timestamp. Because the ISO wire timestamp no longer carries its originating browser timezone, first-save validation bounds it to within 14 hours of the selected date's UTC noon. Existing activity timestamps always win, so a later timezone/DST change does not move historical points.

For a metric-only legacy day, the service looks for the configured day marker within that date bound. One candidate is reused; multiple candidates produce HTTP 409 for explicit review. This conservative rule cannot reconstruct an unknown historical timezone, and adjacent extreme-zone ranges can overlap. It is preferable to a silent timestamp rewrite or accidental duplicate. No historical records are deleted to resolve ambiguity automatically.

## Notes and drafts

New Work-managed notes use source `work_day`; their IDs are recorded on the canonical activity. Only the owned note is updated/cleared. A legacy source-null note is adopted only when its content matches the canonical activity's saved note. Unrelated comments and additional historical notes remain untouched. The Work loader prioritizes `work_entry.data.note`, so a different older first comment does not replace the saved Work note on reload.

Note origins are strings, matching the shared API contract; they are not restricted to metric/activity data sources. Previously the note row mapper parsed `work_day` as a data source and threw, so reading an otherwise successfully saved Work day could return HTTP 500. The mapper now preserves note origins and maps a null source to undefined without widening metric/activity source validation. Regression tests cover Work and other note origins, and save/correction followed by both single-entity and batch reads of the activity and metric notes.

The browser sends one save request instead of separate metrics/comments/activity requests. Its mutation captures the saved profile/date/user and grid. Draft removal happens only after successful commit and only if the stored draft still matches that snapshot; newer edits and failed-save drafts remain. Query invalidation targets the saved day/profile. Server validation/conflict errors are surfaced with a draft-retained message. The app's separate account-session boundary handles account switches.

## Integration and verification map

- REST: [work-router.ts](../apps/backend/src/routes/work-router.ts), mounted by `api/rest-routes.ts`.
- MCP: [work-tools.ts](../apps/backend/src/mcp/work-tools.ts); `set_` is recognized as mutating by read-only classification.
- Web adapter: [state/api/work.ts](../apps/web/src/state/api/work.ts); save UI in [WorkMetrics](../apps/web/src/pages/WorkMetrics/index.tsx).
- Tests: [work-day.integration.test.ts](../apps/backend/src/services/work-day.integration.test.ts), [REST](../apps/backend/src/routes/work-router.test.ts), [MCP](../apps/backend/src/mcp/work-tools.test.ts), existing Work model/settings/day-state/onboarding tests.

Tests exercise concurrent first saves, retry identity, forced post-metric rollback, tombstones, historical IDs/timestamps, unrelated notes, ambiguous markers, empty/zero grids, invalid ranges, archived profiles, user-database isolation and notifier failure. Existing Work frontend model suites verify that extracting shared calculations preserves previous behavior. Test results and deployment status belong in the release report; this document is not a deployment claim.

The transaction protects this endpoint. Older clients or generic metric/activity APIs can still edit their respective storage directly; they do not acquire this Work transaction lock. The existing last-writer-wins model remains for two complete valid edits to the same day; this change does not add a per-day optimistic revision protocol or merge two competing grids.

Work writes require custom count metrics. Profiles configured with built-in health metrics (including steps) or custom metrics using another unit are rejected before committing; they must be reconfigured explicitly. Existing historical points are retained. Profile names that exceed the activity title limit are rejected. Meaningful activity edits refresh the ordering timestamp; identical retries preserve it.
