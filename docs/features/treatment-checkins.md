# Treatment check-ins — release one

This workflow is a personal journal, not clinical monitoring, a validated assessment, or a treatment recommendation. Its driving rule is to record what is known at the time: missing answers stay missing, and a late reflection never fills an immediate or next-day observation.

## Session state and existing records

An actual end time makes planned/in-progress sessions appear as **Session ended**, and session saves persist that transition. Canceled, archived, and explicitly incomplete sessions retain those states. No end time is invented. The session and its optional paperwork have independent states.

Earlier sessions do not receive new plans, notifications, or questionnaires. Only questionnaires with saved answers appear in their legacy history. Big Five, Mensa, and reaction activities remain available in Mental Assessments, but are not automatically assigned as treatment work. Existing answers are preserved.

## Building a plan

Treatments → Library supports custom treatment types and questionnaire creation. A treatment type can store a starter check-in plan. A new session copies that plan and lets the user change it before saving. Editing type defaults later does not modify existing sessions.

The initial optional brief plan includes:

| Entry          | Opens                                | Window closes                                                                 |
| -------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Before         | One hour before planned start        | Actual start, or six hours after planned start if no actual start is recorded |
| After          | One hour after actual end            | 24 hours after actual end                                                     |
| Next day       | 24 hours after actual end            | 48 hours after actual end                                                     |
| Optional later | Three or seven days after actual end | 24 hours after opening                                                        |

These are product defaults for journaling, not clinical requirements. A missing end leaves post-session entries waiting for that fact. Editing actual times reschedules unfinished entries; completed entries retain their original window and observation time.

Users may also select up to twelve questionnaires from the library, each with its own offset from the actual end (0–8760 hours) and open window (1–720 hours). The selected questionnaire version is frozen in the session plan. Its question IDs/versions remain linked to the immutable question definitions used by ordinary assessments. A questionnaire's own instructions and recall period still apply; selecting it does not make it a validated measure of immediate treatment response.

The brief form records optional mood, interest/enjoyment, everyday functioning, a personal goal, sleep where relevant, unwanted effects, and notes. The after-session form focuses on difficulties and optional reflection. There is no total wellness or effectiveness score. Brief questions are a reserved, versioned application questionnaire. Users create their own questionnaire rather than editing that definition.

## Returning after a gap

A passed window remains **Window passed · not recorded**. Users may leave it as-is, skip it, record how they feel now, or add a later reflection. The reflection explicitly allows uncertainty. Current entries and later reflections have separate stage labels and cannot complete a missed historical entry.

Autosaved drafts are stored in the authenticated user's database. They are not completed assessments and do not produce scores. Draft revisions prevent an older tab overwriting a newer draft; session-generation guards prevent queued browser work from writing after an account change. Completing a check-in locks its record and atomically creates one assessment, with idempotent completion retries. Saving or skipping stops its reminders. A voided saved assessment is shown as **Saved record was voided**, not silently changed to incomplete or zero.

Treatments and Mental Assessments display the same check-in and assessment IDs. The Today screen also surfaces ready scheduled entries. The all-session panel shows the latest 500 check-ins; session-specific links retrieve that session directly, including outside the ordinary journal date range. Complete JSON/CSV and database exports retain plans, drafts, and check-ins alongside assessment facts. New check-in answers are not automatically projected into generally shareable custom metrics.

## Notifications

Reminders are off until enabled in the session/type plan. Settings → Notifications has a separate **Treatment check-ins** preference. A session can change reminder opt-in and quiet hours without changing the plan's questionnaire selection.

The worker uses the existing central notification store and authenticated notification actions. The notification title/body are generic; the app link opens the exact session/check-in. Complete opens the form; Snooze and Skip are available in the form's entry card, with Snooze/Skip also exposed as notification actions. Android uses its existing central polling, generic types, actions, and embedded web destination. This release does not publish an APK or promise exact delivery timing.

There are at most two notifications per check-in: the initial reminder and a follow-up four hours later if still inside the window. Snooze moves the remaining reminder; it does not create an unlimited sequence. Quiet hours use the session's IANA timezone, including DST. Equal start/end disables quiet hours. Deferred reminders beyond expiry are discarded. Workers do not replay occurrences more than one hour late, and adding a historical end time does not enqueue a backlog. Turning delivery off does not erase saved observations. Device polling may delay actual presentation beyond the server's enqueue time.

The worker and mutations lock session then check-in. Notification creation and reminder advancement share a transaction; failure rolls both back. Expired/completed/skipped/canceled notifications lose their actions. No notification implies someone is reviewing the user's answers.

## APIs and storage

- Additive per-user tables: `treatment_checkin_plans`, `treatment_checkins`.
- Additive type column: `treatment_types.default_checkin_plan`.
- Existing assessment/question/version tables store completed answers.
- `GET /treatment-checkins?treatment_session_id=…` lists entries and readiness.
- `POST /treatment-checkins` starts a current check-in or later reflection.
- `PATCH /treatment-checkins/plans/:id` changes reminder preferences.
- `PUT /treatment-checkins/:id/draft`, `POST /:id/complete`, and `POST /:id/action` save or act on an entry.
- Matching MCP tools bind every operation to the authenticated account. No user identity is accepted from request content.

The planned entry snapshot is immutable. Existing plans can change notification preferences and skip entries; replacing their questionnaires or adding more scheduled entries after session creation is not part of release one. Create or adjust a starter plan for the next session instead. Provider-required workflows are not modeled: these entries are optional personal tracking and must not be presented as discharge, safety, or clinical obligations.

## Release two — planned, not implemented

After release-one approval, prepare a separate reviewed change for optional standardized assessments and useful longitudinal summaries. Candidate instruments are PHQ-9, WHO-5 and possibly QIDS-SR16. Choose a small useful set; verify licensing, exact question wording, response options, recall periods and scoring before implementation. Do not relabel their multi-day recall as immediate response.

Offer a deeper assessment without creating another overdue obligation when declined. Before enabling questions about self-harm or urgent concerns, implement an appropriate response flow and make the lack of clinician monitoring explicit. Summaries should compare recorded mood/functioning and reported difficulties, preserve timing/missingness, avoid causal claims, and support a user-controlled appointment export. Publication/deployment requires a separate user review and approval after the implementation is ready.

## Release-one verification

Local verification on November 18, 2026 passed:

- 7,444 backend unit tests (one existing skipped test), run in UTC.
- 1,818 database integration tests across 146 files, including check-in isolation, concurrent completion, notification rollback, and real database dump/restore with saved plans and drafts.
- 2,587 web tests, production web build, aggregate formatting/type/lint checks, and OpenAPI/TypeScript/Kotlin generation.
- Synthetic browser checks for a missed window, draft save/reopen, completed history, and a custom questionnaire plan; narrow-screen sizing had no horizontal overflow.
- Full-history Gitleaks scan: no findings. Two bounded independent Astra reviews completed; the final review found no remaining P1/P2 findings in the changed functionality.

The local integration run used disposable PostgreSQL containers with temporary memory-backed storage and the PostgreSQL client from the same test image. No production database or account records were used. Android build/test and GitHub CI remain release gates; a local Android SDK was unavailable. Publication of the review branch requires user approval after automatic approval review blocked the source upload. Nothing in this verification constitutes deployment approval, and release two remains unimplemented.
