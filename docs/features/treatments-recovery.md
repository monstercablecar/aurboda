# Treatments, medications, and recovery

Aurboda stores medication, supplement, treatment, assessment, and recovery observations in dedicated normalized PostgreSQL tables. This feature is a personal record and analysis aid. It is not a medication reminder delivery system, medical advice, clinical decision support, or evidence that one observation caused another.

## Data model

- **Substances** are mutable catalogue/configuration records. Each has a stable `analysis_key`, a default unit, optional dose/route defaults, status, tags, and an immutable version snapshot for every change.
- **Regimens and items** describe schedules and configured doses. Regimen changes also create immutable version snapshots.
- **Administration events** are facts. Each retains its own timestamp, scheduled timestamp, IANA timezone, dose, unit, route, status, source, and optional treatment/regimen links. Changing a substance or regimen default never changes a past event.
- **Treatment types and sessions** capture planned and completed recovery/treatment work. Many administration events and assessments can reference one session.
- **Questionnaire templates and questions** are editable and versioned. Every question version keeps an immutable definition snapshot, and assessment responses retain the exact question ID and version they answered.
- **Context events** capture observations that may help interpretation without asserting causality.

Administration, treatment, assessment, and context deletion is soft deletion. Administration corrections and voiding first write an immutable revision snapshot. Catalogue rows referenced by history are restricted from hard deletion.

## Scheduled versus actual

A regimen expresses intent, not exposure. The Today view evaluates recurrence rules in the requested local date and IANA timezone, but it never manufactures administration events. Partial stack confirmation records only the submitted items. Retry-safe confirmation derives a child idempotency key from the request key and item ID.

Administration statuses are:

- `taken`, `delayed`, and `partially_taken`: count as observed exposure and require a positive dose and unit.
- `skipped`, `unknown`, `canceled`, and `entered_in_error`: do not count as exposure.

## Analysis projections

Administration facts remain in their normalized table. For compatibility with existing charts and correlations, Aurboda recomputes derived local-day custom metrics after create, correction, and void:

- `pharmacology_<analysis_key>_taken`
- `pharmacology_<analysis_key>_event_count`
- `pharmacology_<analysis_key>_dose_<unit>`

Dose projections never combine different units. Routes remain on events; the Insights response warns when a substance has mixed routes. Numeric and Likert assessment answers are also written through to their question's stable custom metric. Corrections replace the prior projection rather than adding another point.

The Insights endpoint reports coverage, sample sizes, missing assessment days, possible duplicates, concurrent exposure days, projected metrics, and data-quality warnings. Its output is explicitly observational and does not claim causality.

## REST API

All routes require the normal authenticated per-user database context and are mounted under `/api/pharmacology`:

- `/substances`, `/regimens`, `/administrations`
- `/treatment-types`, `/treatments`
- `/questionnaires`, `/assessments`
- `/context-types`, `/context-events`
- `/today`, `/timeline`, `/insights`
- `/export` and `/export.csv`

Mutation routes use POST/PATCH/DELETE. Deletes archive catalogue/configuration records or soft-delete medical events. No route accepts a username or user ID.

## MCP tools

The MCP server exposes equivalent tools for substance and regimen management, daily planning and stack confirmation, administration logging/correction/voiding, treatment sessions, questionnaires and assessments, context events, the combined timeline, insights, and JSON export. Tool descriptions distinguish schedules from actual administrations and instruct clients to reuse idempotency keys when retrying writes.

## Export and backup

The JSON export includes all 16 domain tables, including substance/regimen versions, administration revisions, and immutable question definitions, so history can be reconstructed. The CSV export emits one tabular row per domain record with its complete JSON payload. The existing SQL dump automatically includes these tables and remains the authoritative whole-database backup.

Reminder settings are stored as regimen metadata only. Notification delivery is intentionally left to a future PWA/Android layer.

## First-time setup

1. Open **Treatments → Library → Add substance**.
2. Enter a display name, category, dose unit, and any useful default dose, formulation, route, tags, or notes. Mark frequently used as-needed entries as PRN favorites.
3. Repeat for each medication or supplement. Separate formulations that should remain analytically distinct.
4. Select **Add regimen**, name the stack, choose its recurrence rule, and add each substance with its actual configured dose, unit, route, and local time.
5. Save the regimen. It appears under **Treatments → Today** only on matching local dates; opening it does not record a dose.
6. When the stack is actually taken, open it, deselect or adjust exceptions, verify the administration time, and confirm. Only the selected items become administration events.

Use **Add PRN** for an as-needed administration, **Add context** for illness/travel/stress and similar observations, and **Journal → New session** for a treatment. New sessions initially select **Chamomile**, followed by **Meditation** in the type list. These are optional journaling examples, without seeded substances, doses, or follow-up schedules. Custom types follow, with **Ketamine** farther down and still available. If Chamomile is inactive or unavailable, the form requires an explicit type choice. All types remain editable in the Library; adding these defaults preserves existing type customizations and saved session facts. Ketamine retains its pre-session/post-session/next-day forms and 24/48/72/168-hour follow-up interval metadata.

Questionnaires are also managed in the Library. The editor supports all response types, individual question enable/disable, scale bounds and anchors, choice lists, stable analytics metric names, and question ordering. Saving an edit creates immutable definition snapshots so prior responses retain their original meaning.

## Viewing and analyzing results

- **Today** is the low-friction logging view.
- **Journal** combines administrations, treatments, assessments, and context events on one factual timeline.
- **Insights** shows coverage, missingness, duplicate suspects, exposure counts, concurrent-exposure days, and available projected metrics. JSON and CSV exports are available there.
- Select a projected metric's **Chart** link to graph it in Aurboda. Select **Open Analyze** to compare it with sleep, HRV, activity, Health Connect, Garmin, CPAP, or other metrics that are actually present in the database.

Assessment metric names come from the questionnaire editor. Substance exposure metric names are derived from the substance's stable analysis key. These are observational inputs to Aurboda's existing charting and correlation tools, not estimates of neurotransmitter activity, treatment efficacy, or causality.

## Current limitations

- Reminder preferences are saved, but browser/Android notification delivery and home-screen shortcuts are not implemented yet.
- Follow-up intervals are stored on treatment sessions, but they do not yet create notification tasks automatically; later follow-up entries reuse the configurable follow-up questionnaire from the session journal.
- Treatments does not perform medication-interaction checking, pharmacokinetic modeling, dosing guidance, or automatic regimen changes.
- Its Insights view summarizes data quality and exposure coverage. Advanced adjusted models, automatic confounder control, and ranked causal claims are intentionally not generated; use Aurboda's existing Analyze tools for exploratory comparisons and interpret small or confounded samples cautiously.
- Chamomile, meditation, and other non-ketamine sessions offer optional **Session preparation**, **Session reflection**, and **Next-day reflection** text prompts. Ketamine sessions retain their dedicated questionnaires. Other enabled custom questionnaires remain available for every session type; general per-treatment assignment is not yet a separate configuration layer. Previously used questionnaires stay visible on their saved sessions, including legacy cross-type answers. Non-ketamine sessions mark substance records as optional. Existing questionnaire definitions and saved responses are preserved.

## Nutrition questionnaire ownership

Managed Simple Food questionnaires (daily nutrition, REAP-S, and nutrition/GI intake) are shown and answered on `/simple-food`. Treatments excludes these templates and their assessment rows from its check-in, library, and journal views; it does not remove their saved data. Old Treatments questionnaire links provide a link to Simple Food. General questionnaire controls accept both legacy string choices and structured value/label choices, preserving stable answer values and optional detail text.

### Reconciliation and navigation

Today flags only unrecorded items whose scheduled time has passed in the selected timezone, or items on an earlier date. Future dates and later scheduled items are not overdue. Items without a scheduled time remain pending throughout today; they need reconciliation on earlier dates. An unrecorded outcome is not proof of a missed dose.

Historical stack confirmation starts with a blank required actual date/time. Finishing a partially recorded stack excludes already recorded and paused items. The Treatments route scrolls as one document so its navigation tabs retain their full height even when the journal is long.


## Treatments correction verification — November 12, 2026

Private Foghouse deployment `81e4a93-treatments-20261112` fixes per-item overdue detection, requires an explicit actual time for historical stack confirmations, and prevents the Treatments tabs from shrinking. Unscheduled items on the current day remain pending without an overdue warning. Future dates and later scheduled times are not reconciliation items.

Validation: 22 backend pharmacology unit tests; 21 focused Treatments web tests; all 1,557 web tests; web typecheck and production build. An isolated release from development HEAD plus only the Treatments changes excluded concurrent unrelated work. Browser fixtures reproduced the old 9.6px tab height and verified the corrected 53.6px height at desktop and mobile sizes. Backend-wide typecheck remains blocked by the existing extensionless import in `apps/backend/src/schema/work.ts`.

Deployment used a derived image containing only the rebuilt web assets and pharmacology service, after validated database backups. Local and public status returned the release label; public JS/CSS matched the isolated build and the live service file matched its source hash. Prior image: `localhost/foghouse-aurboda:before-treatments-20261112`. The seven changed Treatments source/test/documentation files were synchronized into `source/` for future builds. No treatment records were altered by the fix.


## Follow-up timing and display audit — November 12, 2026

Historical PRN, assessment, and context forms now require explicit actual timestamps when opened for another selected day. Session edits clear removed timestamps and reject an end before its start; context entries reject reversed times. Today refreshes every minute and rolls its default date forward at midnight. Batch confirmations omit a shared scheduled timestamp when the selected items have differing schedules, rather than attaching the first item's schedule to every item.

Daily results use an exclusive next-midnight boundary. Confirmation state counts unique latest valid item outcomes, not duplicate records, and incomplete skipped/canceled stacks remain partial. Stack and item date bounds, paused items, and schedule overrides are respected in the returned daily plan. Upcoming sessions include only unstarted planned sessions and sort earliest first.

Insights retains usable date controls on loading/error, rejects empty/reversed date ranges without issuing a request, and offers retry. Long metric names wrap; units remain visible on mobile. All four tabs fit narrow screens.

Predeployment verification against the deployment source: 1,678 web tests passed, web typecheck passed, and all four views were exercised with isolated sample data at 1440×700 and 390×844. Browser checks covered clipping, page overflow, retained tab height, and date-range recovery. No stored treatment records were modified.


### Bedtime stacks after midnight

For items scheduled at 18:00 or later, an actual dose before 06:00 in the selected Treatments timezone completes the previous night's item. Exactly 06:00 belongs to the new day. Morning, daytime, and unscheduled items retain calendar-day completion, including within mixed stacks. The saved scheduled time identifies evening items when available; older entries without it use the item's configured time.

This changes completion display only: actual administration timestamps, journal history, exposure metrics, and exports retain the real time taken. The previous day's plan includes matching doses through the following morning, while the new day's evening stack remains unfinished. Existing records receive the same completion rule without rewriting them. The confirmation form explains the cutoff; no manual timestamp backdating is needed. Stacks need evening item times configured for this rule to apply.
