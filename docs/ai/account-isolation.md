# Browser account/session isolation

The web app now treats every username or bearer-token change as a new session, even when logging back into the same account. `apps/web/src/state/auth.ts` subscribes to the auth signal, so password login, signup, passkeys, direct assignments and replacements of native-seeded credentials share the boundary. Cross-tab changes to the `auth` local-storage entry also update the signal. A failed login or an admin-flag-only update leaves an unchanged session intact. Pending login/passkey attempts cannot overwrite a newer session.

`apps/web/src/state/queryClient.ts` creates a new QueryClient per transition. It cancels queries, clears query and mutation caches, retires the old client, and synchronously detaches mutation observers (including per-call callbacks). Mutation functions and lifecycle callbacks are guarded against retirement; re-defaulted options preserve these guards. Old component callbacks retain the old client rather than writing into a reused cache. The exported current client remains available for global invalidation, while components use their provider's client.

`apps/web/src/components/SessionBoundary.tsx` keys the provider subtree by a nonsecret generation counter. This remounts routed components and clears private component-local state on account/token changes. Do not key DOM elements by raw bearer tokens. Switching accounts intentionally drops unsaved in-memory forms; account-scoped persistent Work drafts are not deleted.

`apps/web/src/state/sessionBoundary.ts` captures the session generation synchronously when Axios dispatches a request. Responses or errors from an earlier generation are rejected as canceled before awaiting API code continues. This prevents old query functions from restoring persistent dashboard snapshots after an account switch. Existing Resources logout cookie cleanup remains in place: fencing a response does not undo or cancel the request's server-side effect.

Only `aurboda:dashboard:*` cached dashboards are removed from local storage on transitions. Other storage, including Work drafts, is retained. Native bootstrap also discards browser dashboard snapshots when bridge credentials replace stored credentials. Public queries currently rotate with private queries for simplicity; they may refetch after a switch.

## Guarantees and limits

These changes isolate displayed data, browser query/mutation caches and the existing dashboard persistence path. They do not revoke server tokens, erase browser history, remove downloaded files or undo requests already accepted by the server. JavaScript callbacks already executing at the transition cannot be rolled back. New asynchronous code must use the fenced shared Axios client and session-bound QueryClient; custom fetch clients, independent persistent stores or external side effects need equivalent guards. Never assume canceling a browser mutation rolls back a backend write.

Native credentials are read at startup; subsequent native changes must replace the auth signal or reload the embedded page. No speculative native event name was introduced. Cross-tab updates synchronize browser credentials without revoking another device's valid server session. Server authorization remains mandatory.

## Verification and extension points

`apps/web/src/state/accountIsolation.test.ts` covers direct changes, token rotation, unchanged/failed authentication, same-user relogin, native bootstrap, cross-tab updates, old query results, old mutation callbacks (including observer-local callbacks), repeated defaulting and Axios persistence fencing. `apps/web/src/components/SessionBoundary.test.tsx` verifies private local state is remounted. Existing `apps/web/src/state/dashboardCache.test.ts` covers the narrow storage cleanup contract.

The pending Resources route and logout-cookie changes were retained. People primary buttons now use the documented `--color-primary` token with white text, rather than the dark-mode light accent token.
