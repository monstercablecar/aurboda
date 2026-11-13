# Released-main update — November 13, 2026

I want to keep the upstream fixes without losing the things we've added. This update merges released `main` at `761f0422236ce1a5ebc962deba3f0e12a0fddb7f` into the Foghouse snapshot `5f74a01dacae244bd1184649126c8d07936e2448`. It keeps both parents; nothing is rebased or replaced with a clean upstream copy.

The release adds dashboard save/layout/navigation fixes, sleep timestamp repairs, portable shared-food references in account exports, correlation fixes and longer analysis windows, Help/support settings, and Feed hashtag, relay, picture and article improvements. Newer `develop` work, including the central notification feature, is outside this update.

## Conflict decisions

- Keep People reminders alongside upstream Feed startup services.
- Keep Resources in the central database alongside upstream public tags and relays.
- Keep schema migration failures closed with a retryable 503; add upstream food-reference restoration and name upkeep after successful migration.
- Keep request audit privacy when adding the upstream query-schema selector.
- Keep account session fences, query-client rotation and resource-cookie logout while adding upstream period-cache cleanup.
- Keep all custom mutating MCP classifications and add upstream post-update handling.
- Update export documentation: referenced shared food items now travel with an export; shared Resources, central account configuration and unsaved browser state still do not.

Work, People, Tasks, Resources, Treatments, assessments, CPAP, Simple Food, onboarding, games and browser reminder features remain in the merged tree. Official-only Android and Docker publishing guards remain. Validation CI now also targets the Foghouse branch; this does not publish an APK or container.

The initial publication inventory remains a historical inventory against November 9. For the current custom delta, use `git diff 761f0422236ce1a5ebc962deba3f0e12a0fddb7f HEAD`; for what this update brings in, compare with `5f74a01d`.

## Validation

The existing local Node 26/pnpm installation was reused; upstream did not change the package manifests or lockfile from the November 9 baseline. Shared API build, `pnpm check`, and web production build passed. Lint warnings and the existing large-chunk build warning remain.

The full local web run passed 1,923 tests; one DST test was blocked by subprocess permissions. The backend unit run passed 4,714 tests, with 831 failures and 832 errors in the restricted environment, including denied server sockets. That is not an all-green backend result. Focused validation/privacy and MCP mutation tests passed (55 tests), as did dashboard queue/session/cache regressions (33 tests). GitHub CI is the full database and Android validation gate; its results are tracked in the fork's pull request.

The update also fixes the publication's duplicate import and lint errors without changing feature behavior. The new dashboard saver is fenced by session generation: pending edits and callbacks from one account cannot continue after switching accounts. Every one of the 300 files originally added for Foghouse remains, as do the custom REST/MCP registrations, schema entries, and Work's `work_day` note origin.

## Deployment boundary

The first Android CI run exposed invalid generated Kotlin defaults and enums in existing custom schemas. A tested postprocessor now preserves numeric/boolean enum wire values, constructs the default People payload, and quotes Kotlin's `context` keyword. Zod contracts and server defaults are unchanged. Android serialization regressions cover those cases; CI must verify the corrected generated models.

No deployment has been performed. Upstream now seeds a `tags.pub` relay subscription on public HTTPS servers. Once accepted, that relay receives explicitly public Feed posts and their updates/deletions, not private tracking records or unlisted/followers-only posts. Admins can remove the relay; its seeded flag prevents startup from adding it again. Review this setting when deploying. Publishing this source does not subscribe the running server.
