# Guided setup

The dashboard setup guide has three chapters: Start here, Connect your data, and Explore your workspace. It presents one expanded step at a time and keeps completed, skipped and remaining counts separate. All integrations and feature tours are optional. Browser orientation uses an explicit “Got it”; the six feature tours use “I've explored this” and do not imply that personal records have been saved.

The browser at https://stats.foghouse.org is recommended for full dashboards, detailed history, longer questionnaires, Work, People and bigger forms. Aurboda Android is the companion for Health Connect/device integrations, background syncing and quick checks; supported features remain accessible inside its embedded browser. Public upstream APKs may still have an upstream server default. Users must set Server URL to https://stats.foghouse.org, sign in, grant Health Connect read permissions in Sync, permit background access and battery exemption, then use Sync Now. Existing saved server choices are never overwritten.

## Feature selection

Start here begins with “What would you like to track?” and the shared [Feature Control](feature-control.md) switch list. Choices save to the account’s existing settings; completing or skipping this step is explicit. Hidden pages can be restored in Settings. Previously dismissed guides remain dismissed. Hiding affects navigation only; it does not delete records, stop integrations, or revoke access.

## Progress and verification

`onboarding_progress` is a per-step map of `completed`, `skipped` or `pending`. PATCH merges individual entries; `null` clears the map. The UI never clears progress to reopen. Explicit map entries override legacy `onboarding_manual_done` entries. Completion persists when data ages out or a provider disconnects.

Android requires raw records from `health_connect`. Wearables require a connected Garmin, Oura or Strava account and raw records from that same source, queried with a one-record payload limit. Historical records establish setup, not recent synchronization health. Desktop setup uses the existing ActivityWatch device check plus desktop productivity records in the past seven days; once verified, its durable completion does not expire. Social setup detects a follow or challenge participation. AI setup is explicitly self-confirmed. Signal failures display an unknown state and Retry rather than being represented as missing data.

Only confirmed saves update completion. Initial verified records are silently persisted; newly arriving data and explicitly completed steps can celebrate. Skipping does not celebrate. Finishing keeps the summary visible until Done or Hide; returning to an already resolved guide hides it by default. Returning to an unfinished guide selects the first pending step across all chapters, skipping durable completed and skipped steps. This selection happens once when settings first load; later saves and refreshes preserve the current chapter and step selection. It resumes unfinished work rather than restoring the last viewed screen. Settings → Open setup guide clears dismissal only and opens `/?onboarding=review`, retaining completed and skipped choices.

## Local review

`apps/web/onboarding-preview.html` loads the real pure `OnboardingFlow` with simulated in-memory state. “Simulate first sync” demonstrates connected/waiting becoming complete. Links are intercepted, secure installation is represented by a safe explanatory panel, and the preview neither authenticates nor reads or mutates account data. It is not registered in application navigation or the main production build entry.

Focused tests cover durable/legacy precedence, separate skip counts, provider-connected-without-data, save and dismissal failures, automatic retry, silent baseline, new-data celebration, finished review, settings reopen, session-change fencing, and source-specific Android status. The web production build and full web suite passed (1,659 tests). Settings validation/migration unit checks (97) and disposable PostgreSQL settings integration checks (22) passed. Android SDK verification was unavailable; the downloadable APK remains unchanged.

Deployed November 12, 2026 as `foghouse-onboarding-20261112-01` using the existing validated-backup/build/restart workflow. Local and public `/api/status` reported that exact version; the service was active and the public onboarding/Settings assets were verified. Protected release record: `releases/20261112T221526Z.foghouse-onboarding-20261112-01.seOjjW`.

Resume follow-up (November 12, 2026): the first unfinished-step initialization passed 14 guide tests and the full web suite (1,678 tests). A parallel release, `treatments-audit-20261112-02`, included the exact reviewed guide and test hashes. Its protected record is `releases/20261112T223109Z.treatments-audit-20261112-02.pygGQF`; backup, build, and health phases succeeded. Public status matched that release and the public onboarding bundle matched the running container byte-for-byte. No additional restart was needed.
