# Feature Control

Settings → Feature Control lets each signed-in user choose the pages shown in the web sidebar (expanded and collapsed) and mobile browser menu. The same switches appear in the initial onboarding step, “What would you like to track?”. Existing accounts start with all pages visible. Every switch saves immediately; onboarding completion and skipping are separate explicit actions. Previously dismissed guides stay dismissed.

Descriptions appear on hover or keyboard focus on desktop and remain visible on touch devices. Switches have accessible names and descriptions. Settings is always available, including when a client submits `/settings` in the hidden list. Home’s brand link also remains available. Admin controls are listed only for administrators; page visibility never grants administrator rights.

Hiding affects menu links only. Direct URLs, page content, dashboard widgets, recording, background sync, integrations, API/MCP access and saved data remain available under their existing authorization. Sharing and Data Sources groups disappear when they have no visible children. Data Sources child pages can be selected individually. If its overview is hidden, a collapsed sidebar links to the first visible child.

## Adding a page

Add its normal entry to `apps/web/src/components/nav-links.ts`: `NAV_LINKS_PRIMARY`, `NAV_LINKS_SECONDARY`, `SHARING_LINKS`, or `DATA_SOURCE_LINKS`. The Feature Control catalog is derived from these same collections rather than a separate list. A new entry automatically gets a switch and starts visible. Optional `description` text explains the page; missing descriptions fall back to “Show [page] in your menus.” A description is never required to hide a page. Keep stable `href`/`path` values because those are preference keys. New Journal or other feature entries follow this contract without adding another registry entry.

Utility Settings, Help and administrator entries are included through their shared navigation definitions. Login, signup, legal pages, public profile links and detail routes are not signed-in feature menu destinations. Register a new user-facing menu page in the shared collections rather than hardcoding links independently into Header or Sidebar. Routes and page components remain registered normally; Feature Control does not discover arbitrary files or turn routes off.

## Storage and integration

`hidden_pages` is an account-scoped array of absolute navigation paths in the existing user settings JSON. The existing GET/PATCH `/user/settings` and settings MCP tools read/update it. Default is `[]`; `null` clears it. Unknown path keys are retained when toggling other pages, so temporarily unavailable or future features do not lose user choices. Only `hidden_pages` is submitted for a visibility change. The existing settings export/backup includes it without a new table or migration.

The UI uses the existing session-scoped `userSettings` query. It waits for a successful saved response before changing menus, reports errors without changing preferences, serializes switch saves and rejects stale completion after an account/session change. Loading failures have a Retry action. Switching choices during onboarding does not mark its step complete.

## Native Android boundary

These controls update server-served web menus, including mobile browsers. Embedded Settings and onboarding expose the controls too. The official upstream APK’s native More hub and bottom tabs do not consult this preference and remain unchanged. This is a native parity follow-up, not a claim that the APK filters its menus. A tracking issue could not be created because this fork has GitHub Issues disabled; the Feature Control pull request tracks this gap. No APK is built or distributed by this feature.

## Verification

Tests cover discovery without a description, all existing navigation collections, new-page defaults, unknown key preservation, Settings recovery, immediate desktop/mobile/collapsed menu updates, empty groups, independent source visibility, saved failure/retry, unsuccessful API responses, stale-account saves and inline onboarding selection/completion/skip.


November 13, 2026 validation: 48 focused frontend tests and the full web suite (211 files / 1,940 tests) passed. The full suite was rerun after the final in-flight-query cancellation safeguard and new-page DOM test; the final guard refactor also passed all eight Feature Control DOM tests. Web/backend type and lint checks and the API package check passed with existing warnings; the web production build and OpenAPI/TypeScript/Kotlin generation passed. Backend settings and settings-migration units passed (103 tests). Generated files remain excluded according to the repository policy.

The settings database integration test was added but could not start locally because no container runtime was available. The wider backend unit run was interrupted by automatic approval review over a possible unmocked external Oura request; no passing result is claimed for that run. GitHub CI must establish the complete backend/database and Android results. No native Android build, manual browser/device visual check, server deployment or live-data modification was performed here.
