# People

People is part of the existing Aurboda web application at `/people`, also available in Android's embedded web navigation. A new account starts empty. Creating a profile never creates an account for the represented person or shares information with them.

For temporary illness, pregnancy, grief and other care contexts, see [People care and Help Tree](people-care.md). It covers episode lifecycle, optional tracking, consent, pregnancy timing and the actual guidance dependencies.

## Architecture and privacy

The shared Zod schemas in `packages/api-spec/src/schemas/people.ts` define REST, MCP and frontend contracts. Authenticated REST routes under `/people` and MCP tools call the same backend services. The existing authenticated username selects its own PostgreSQL database; no client-supplied owner selects the data boundary.

`people` stores UUID-keyed profiles. `people_events` preserves each event's timestamp, recording time, actor, source, privacy and revision, together with its structured payload. `people_feedback` tracks catalog-version-specific dismissal/completion. Person-owned metric projections remain private. Foreign keys cascade on permanent person deletion, so a new person with the same name cannot inherit old events or feedback. Profile edits preserve recorded events. This ownership boundary does not cover independent audit logs or backups: the current authenticated request audit middleware can retain small request bodies, including notes. See [audit-data debt](ai/technical-debt.md) before making deletion or logging guarantees.

The existing global `time_series` and custom metric registry are selectable from shared dashboards and do not have a per-person privacy boundary. People deliberately does not publish private observations there. `people_metric_points` retains private timestamped numeric projections instead; sharing and cross-person metric dashboards are not supported. This is a documented deviation from the requested native numeric-metric reuse, required to preserve privacy without changing unrelated sharing behavior.

The backend computes calendar ages, corrected developmental age, life stages, applicable modules, optional metric definitions, all guidance eligibility and prioritization, reasons, feedback expiry and interval unions. Corrected age does not change chronological safety eligibility. The frontend renders the returned dashboard and handles forms and display formatting. It does not carry its own developmental rule engine.

## Catalog and rules

The version-controlled local catalog combines developmental, relationship and temporary-care guidance. See [catalog coverage](people-catalog-coverage.md) for exact relationship/life-stage/domain counts, verified source links and gaps. Catalog updates are explicit software/content updates. No runtime AI, inference, external advice service or knowledge lookup is used.

CDC's twelve official checklist ages provide previous and next context. Three months uses the two-month context and upcoming four-month checklist. WHO's nurturing care, early development and activity guidance is complementary and has a different scope; it is not another CDC checklist. Selected monitoring observations are not clinical screening or diagnoses. Adult relationship guidance includes an explicitly classified conceptual Like Switch framework without calculated relationship scores.

Records use stable identifiers, inclusive minimum/exclusive maximum ages, relationship and selected-context filters, evidence references, content versions and review intervals. Safety remains discoverable when dismissed. The full applicable catalog includes completed and dismissed suggestions. Missing observations never produce a clinical alarm. Explicit optional gender selections can add sourced contextual resources for every relationship type, without changing developmental milestones or inferring biological traits, conditions, personality or household roles. Missing, self-described and undisclosed identities retain general guidance; free text is not classified.

## User flows

- Add/edit one of Child, Parent, Lover, Spouse or Friend; specify a birth date or approximate age as of a date, and select support contexts separately from relationship status, goals and interests.
- Optionally record gender and pronouns, where/when/how you met, and repeatable important dates. Birthdays derive from a recorded birth date; additional annual dates can omit the year. Upcoming dates use the account timezone (UTC fallback); February 29 falls on February 28 in non-leap years. Dates do not automatically schedule reminders.
- Add private journal entries and memories with optional titles and locations. These remain editable timestamped records and do not produce numeric metrics or inferred advice.
- Review server-selected focus, featured guidance, contextual opportunities, developmental references, upcoming plans and sources.
- Add and manage goals for every relationship from the Goals section. Goals have optional target dates and Active, Completed or Paused statuses; completed and paused goals can be reopened. The complete goal list includes older and future-dated entries, independently of the recent-activity limit. Legacy note-only goals remain intact and display as Active when no status was recorded.
- Enable optional metrics individually. Values remain absent until relevant observations exist; there are no demonstration records or invented chart values. The optional Goals metric only counts goal entries dated up to now: enabling it does not create a goal, and the count is not a progress score.
- Record or correct timestamped contact, activities, care, observations, appointments and other supported events. Overlapping shared-time intervals are counted once; duration does not measure relationship quality.
- Browse applicable guidance by topic, life stage, relationship, guidance type or source; inspect the actual reasons and evidence classification.
- Delete a profile through the explicit confirmation explaining permanent removal of its private records.

## Child guide and useful optional tracking

The dashboard's additive `child_guide` groups eligible catalog records into `safety`, `help`, `play` and `watch`. The server owns eligibility, ordering and grouping; the web UI does not recalculate age rules. “Super Baby” labels the guide during the first chronological year and describes everyday responsive care, not accelerated development or intelligence claims. Safety/help references remain visible despite completion or dismissal. Existing featured sections exclude records already shown in the guide.

Guidance remains paraphrased application content. Optional source `official_quote` contains a short checked quotation and section locator; the UI attributes it to the linked publisher. “Source checked” is the application's verification date, distinct from publisher publication/review metadata. Newborn activities and subsequent age bands supplement the existing CDC checkpoints. Corrected developmental age must never defer chronological safety or medical-help eligibility. The guide is not a diagnostic questionnaire or an exhaustive emergency checklist.

Optional tracking retains legacy metric IDs and selections. New rolling metrics use elapsed **last 24 hours** or **last 7 days**, not local calendar days. Contacts and shared time are available for all five relationships; care metrics retain explicit support-context eligibility. Infant/support-context logs can summarize sleep, feeding and classified diapers. Goal status counts describe records, not achievement percentages. Each metric carries its window label and latest contributing event timestamp; missing entries are not evidence that care or activity did not happen.

Completed duration intervals are clipped to the window and overlapping minutes counted once. An interval without an end does not invent a duration. Future-dated observations do not contribute. Feeding amounts only sum within the exact recorded unit; entry counts never estimate breastmilk intake. Growth payload `measurement_type` distinguishes `weight`, `length` and `head_circumference`; unclassified historical values remain separate. `diaper_type` distinguishes `wet`, `dirty` and `mixed`; mixed counts once in each category. These optional JSONB fields require no historical backfill. There are no automatic clinical ranges, percentiles, relationship scores or missing-data alarms.

Read-time metric calculation is authoritative for rolling summaries. The private mutation-time projection is not a continuously refreshed rolling total. Inspect `apps/backend/src/services/people-rules.ts`, `apps/backend/src/services/people.ts` and the shared People schema before changing these semantics; tests cover fixed-clock windows and legacy compatibility.

## Private calendar dates

People birthdays and important dates appear in the existing Calendar / Timeline through the authenticated `GET /people/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` endpoint. MCP `people_calendar` uses the same service. The inclusive range is limited to 3660 calendar days. Occurrences are calculated from the current user's profiles in their saved timezone; all-day boundaries account for daylight-saving changes. Editing or removing a profile/date updates the calendar without copying or deleting unrelated calendar records.

These occurrences remain private: they are not generic tags, shared-dashboard metrics, or external Google Calendar events. They do not schedule notifications automatically. Optional reminders continue through the existing explicitly enabled event-reminder flow.

Date kinds (Birthday, Anniversary, Celebration, Remembrance, Other) select optional practical ideas without medical claims or demographic inference. Explicit kinds override labels; old exact “Birthday” and “Anniversary” labels remain compatible. Remembrance ideas ask whether acknowledgment is welcome and permit leaving the day quiet. Birthdays derived from date of birth are deduplicated against matching saved birthday entries.

Each upcoming date offers **Add to Google Calendar**, using Google’s [documented event-template link](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events#provide_a_link_for_users_to_add_the_event). It opens a single all-day occurrence for the user to review and save; yearly repeat settings are reviewed in Google. This creates an independent copy, not synchronization. Only the display name, date label, occurrence date and profile link are included; private notes, gender and original birth year are excluded.

## Repository audit and isolation

Implementation was based on the actual customized checkout at upstream commit `feae57c68351927f33e322d2c61841b4fed0132d`, including its uncommitted WorkMetrics, CPAP, treatments, settings and browser-push work. The original checkout was not reset, rebased or overwritten. `people-implementation` is an isolated copy with a snapshot baseline commit `00b39824e0943d220ea8e11b60ca8076a3777a7e`; the People implementation commit is a separate delta on that baseline.

Inspected integration points included `docs/custom-dashboards.md`, WorkMetrics event/profile configuration and metric APIs, per-user database connections and transaction helpers, expand-only schema registration, pharmacology REST/MCP/service patterns, shared dashboard data selection, notes, settings, navigation, pg-boss and browser-push. Existing Work frontend rules were not reused as authoritative People rules. Generic notes were not used for sensitive People observations because person-specific cascading ownership is needed.

The child-guide and metrics update was deployed to the private Foghouse instance as `eefee14`; local and public status endpoints confirmed that release. See [verification](people-verification/super-baby.md). Feature patches were also applied to the customized deployment source without resetting its existing work. Testing used disposable databases and a separate persistent local preview with a test-only login adapter; that adapter is not production authentication. See [history and operations](ai/history-and-operations.md) for checkout and release boundaries.
