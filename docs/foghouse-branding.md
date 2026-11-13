# The Foghouse private web branding

Implemented 2026-11-12. Public visitors see Aurboda. Signed-in internal pages use The Foghouse in the desktop sidebar, mobile brand mark, and browser title. Login, signup, legal pages, public profiles/shares and joining a challenge retain Aurboda. Public index metadata, favicon, logo and license attribution remain unchanged. Branding is presentation, not an access-control boundary; normal authentication and authorization remain responsible for privacy.

The existing system light/dark theme remains. Only `/login` receives a scoped dark palette; layout, password/passkey handlers, signup and account policy are unchanged. No Android package or integration changes.

Implementation: `apps/web/src/branding.ts`, `branding.css`, Header, Sidebar and AppShell. The only new visual asset is `apps/web/public/foghouse-mark.png`.

## Logo provenance

Generated with the built-in `image_gen.imagegen` tool using the imagegen skill, transparent background enabled. The generated PNG was copied without modification. Prompt:

> Use case: logo-brand. Create a single refined logo mark for a private personal dashboard named The Foghouse. Icon only, absolutely no text. A simple geometric pitched-roof house emerging through three restrained horizontal bands of fog, clever negative space, quiet welcoming architectural silhouette. Flat vector-like graphic, bold clean strokes readable at 28 pixels, no tiny detail, no gradients, no shadows, no mockup. Pale mist silver with a subtle muted teal accent, designed primarily for a dark navy sidebar. Centered square composition, icon fills approximately 85 percent of canvas, transparent background. One cohesive emblem, not a sheet of alternatives. No letters, no badge border, no landscape, no photorealism.

## Verification

- Development web suite: 167 files, 1,618 tests passed, including 18 branding tests.
- Development web typecheck and production build passed. Scoped lint has no errors; full lint has an unrelated existing missing-braces issue in `state/api/work.ts`.
- Production source api-spec rebuilt and supported web typecheck passed (a preliminary direct TypeScript invocation used stale generated types; the supported build/typecheck resolved this).
- Isolated browser checks at widths 1440 and 390, both light and dark: dark login, Aurboda public branding, rejected and successful password submission using synthetic responses, private logo/title, loaded Resources view, sidebar collapse/mobile menu, logout reverts branding, signup appearance, no page errors. Hardware passkeys and real account creation were not exercised.
- Login/signup components, authentication state, public logo/favicon/index metadata and public chrome checked against pre-change hashes. No branding-related edits to these files.
- Eight implementation/asset files copied to production source after confirming destination files matched the captured baseline. Other feature work preserved.

Deployment and live checks are recorded below after release.

## Deployed release

Release `foghouse-brand-20261112-01` is live at https://stats.foghouse.org. The release script completed the standard backup, built the image, verified the source manifest stayed unchanged during the build, restarted the service, and confirmed the exact version. Protected record: `releases/20261112T195858Z.foghouse-brand-20261112-01.eGnzKQ` in the parent installation. Previous release: `people-hardening-1d1b24d`; retained rollback tag: `localhost/foghouse-aurboda:before-branding-20261112`.

Post-deployment browser checks at desktop/mobile widths passed for public landing, login and signup: Aurboda titles/presentation, dark login, visible password/passkey controls, no browser page errors. API reports the exact new release and invite-only registration; anonymous Resources access returns 401. Live logo.svg, favicon.ico and foghouse-mark.png match reviewed source hashes. Signed-in behavior was verified in isolated browser tests with synthetic API responses, not a real production account; existing authentication handlers are unchanged.
