# Goals, calendar dates and nutrition questionnaire fixes

Verified November 11, 2026 (America/Denver).

## Corrections

- Enabling the old goal metric only displayed an event counter and gave no creation action. Goals now have a permanent dashboard section, explicit Add/Edit actions, Active/Completed/Paused states and optional target dates. Old note-only goals and goals outside the most recent 50 events remain visible. Parent relationships now support goals too.
- Birthdays and important dates render as private all-day Calendar items in Timeline, with links back to People and optional date ideas. Dates are projected directly from current profiles, respecting account timezone, leap days and daylight-saving boundaries. Future navigation and repeated date links work without reversing historical query ranges.
- Date categories include birthdays, anniversaries, celebrations, remembrance and other significant dates. Individual Google Calendar buttons open a reviewable one-off copy; users choose any yearly repeat in Google. No automatic Google writes or sync are performed.
- Treatments' questionnaire renderer discarded object-valued answer choices used by Simple Food. It now supports readable labels and stable values, including multi-select, and preserves structured configuration when editing.
- Managed nutrition questionnaires and their assessment rows are presented on Simple Food rather than Treatments. Old Treatments links offer a Simple Food link. Stored assessments and shared APIs are preserved.

## Validation

- Backend focused unit suite: 51 passed.
- People database integration and REST routing/authentication: 29 passed, including goal lifecycle, legacy data, calendar isolation, range validation and dynamic edit/remove behavior.
- Nutrition questionnaire regressions: 9 passed, including actual managed question definitions and old key/UUID links.
- Shared schema build/typecheck and OpenAPI/TypeScript/Kotlin generation passed.
- Backend typecheck retains the previously documented unrelated Work schema import error.
- Browser preview draft preserved without reload or data changes; preview API updated using the same database.
- Final web suite: 158 files / 1553 tests passed on Node 26. Web typecheck and production build passed; existing large-bundle advisory remains.
- Touched-file lint and Git whitespace checks passed. A test-only auth mock corrected a full-suite import-isolation issue; no application behavior was changed for that correction.
