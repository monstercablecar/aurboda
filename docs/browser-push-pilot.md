# Browser notification pilot

Settings → Browser notifications can enable this browser, send one fixed test, or disable its subscription. There is no scheduler. This is browser-owned Web Push, separate from native Android notifications; embedded app WebViews are unsupported. Permission is requested only on a button click. The service worker has no authentication token, cache, or fetch interception and opens only `/settings` when clicked.

## Server setup

Install the normal backend dependencies and configure `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` through the deployment's secret configuration. The subject must be a valid contact `mailto:` or HTTPS URL. Generate VAPID keys with the installed `web-push` tool outside the repository; retain the private key securely. No keys are included in this change. All three values are required; otherwise operations report unavailable (503). Serve the frontend over HTTPS and include `/notification-sw.js` at the origin root. The existing per-user migration system creates the additive `browser_push_subscriptions` table on use.

Authenticated endpoints under `/notifications/web-push` are GET `/public-key`, POST `/subscription` (endpoint and browser keys), DELETE `/subscription` and POST `/test` (both take `subscription_id`). Subscriptions are isolated by the existing user database routing. This is current-browser credential plumbing, so there is no MCP equivalent. Allowed push hosts are the Google FCM, Mozilla, and Apple push services; other providers are unsupported in this pilot. Request bodies and keys are bounded and tests cannot supply notification content or arbitrary delivery destinations.

## Manual phone test

1. Open the HTTPS site in a supported browser and sign in. On iOS, use an installed home-screen web app where Web Push is supported.
2. In Settings, enable browser notifications and grant permission. Verify the registered status, then press Send test notification once.
3. Check for the fixed “Aurboda Test” notification. Repeat once with the page backgrounded; test with the screen locked where supported. Tap it and confirm Settings opens.
4. Disable on this browser and confirm its subscription is removed. Deny permission in site settings and verify that the next enable attempt reports the permission problem without claiming success.

“Push service accepted” means the provider accepted the request, not that the device displayed or received it. Browser/OS settings, power saving, connectivity, and platform support affect delivery, including when the browser is closed. Tests expire after 60 seconds, use a five-second provider timeout, and are not automatically retried. Expired provider subscriptions are deleted. No live-account test notification or database write is required to run the automated tests; integration tests use temporary databases.

## Pilot files

- `packages/api-spec/src/schemas/web-push.ts`
- `packages/api-spec/src/schemas/index.ts`
- `apps/backend/src/db/browser-push.ts`
- `apps/backend/src/db/browser-push.integration.test.ts`
- `apps/backend/src/schema/system.ts`
- `apps/backend/src/schema.ts`
- `apps/backend/src/services/browser-push.ts`
- `apps/backend/src/services/browser-push.test.ts`
- `apps/backend/src/routes/browser-push-router.ts`
- `apps/backend/src/routes/browser-push-router.test.ts`
- `apps/backend/src/api/rest-routes.ts`
- `apps/backend/package.json`
- `pnpm-lock.yaml`
- `apps/web/src/utils/browserPush.ts`
- `apps/web/src/utils/browserPush.test.ts`
- `apps/web/src/components/NotificationsSettings.tsx`
- `apps/web/src/pages/Settings/index.tsx`
- `apps/web/public/notification-sw.js`
- `docs/browser-push-pilot.md`

## Validation

Shared schema build, web typecheck, production web build, and scoped lint passed. Focused tests passed: 16 backend service tests, four authenticated route tests, one temporary-database isolation test, and three browser permission tests. No live push was sent. The normal backend typecheck remains blocked by an existing missing-extension import in the unreferenced `src/schema/work.ts`; a temporary staging-only check excluding that file passed. No native Android or generated Kotlin files were changed.
