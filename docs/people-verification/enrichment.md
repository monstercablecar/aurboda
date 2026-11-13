# Optional profile enrichment verification

Verified November 11, 2026 (America/Denver).

- Added optional gender/pronouns, how-we-met details, and repeatable important dates; existing profiles and omitted PATCH fields remain preserved.
- Added private journal/memory events with title/location/text and edit/delete support. Blank entries are rejected; journal data never projects numeric metrics.
- Calendar calculations cover unknown years, once-only dates, leap days, duplicate birthday notes, Denver UTC rollover and DST. Account timezone is used with the existing UTC fallback.
- Gender context is selected on the server across all five relationship types. Six new catalog records bring coverage to 109 records / 33 sources.
- Backend focused unit suite: 50 passed. Disposable PostgreSQL People integration: 18 passed.
- Frontend People/navigation tests: 26 passed. Web typecheck and production build passed (existing bundle-size warning).
- Shared schemas build/typecheck passed; OpenAPI and generated TypeScript/Kotlin clients regenerated. Backend typecheck retains only the previously documented unrelated Work schema import error.
- Scoped lint had no errors; backend non-null assertion warnings remain. Git whitespace check passed.
- Live local preview was restarted against its existing persistent database. Browser verified optional identity, meeting details and important-date sections without creating or changing saved people.
