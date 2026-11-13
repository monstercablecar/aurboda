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

Validation is in progress. No deployment has been performed. The existing local Node 26/pnpm installation is reused; upstream did not change the package manifests or lockfile from the November 9 baseline. Final results and remaining limitations must be recorded before this update is treated as ready.
