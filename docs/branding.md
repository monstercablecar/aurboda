# Aurboda branding

The application uses Aurboda's name and original visual identity on public and signed-in pages. The mobile header uses the upstream `/logo.svg`, the desktop sidebar displays Aurboda, and the main HTML supplies the Aurboda browser title. The original favicon and touch icon remain unchanged. Login follows the existing site light/dark theme.

On November 13, 2026, the fork removed its host-specific product name, generated house mark, route-dependent branding/title hook and login-only palette. Onboarding, account instructions, welcome text and preview titles use Aurboda or neutral feature names. The change preserves navigation, Feature Control, Journal, account/session handling and all other functional additions.

Keep the original author's attribution and license. This remains a modified fork; restoring its presentation does not imply upstream approval or authorship of the additions. Hosting names, URLs, service/image names, storage keys, game protocol identifiers and contributor/source provenance retain their existing meaning. They must not be globally renamed as part of a visual change. The separately developed privacy policy and authorization work is outside this restoration.

## Deployment and verification

Apply this change through the normal reviewed integration branch and a clean production build. Do not reset a customized checkout to upstream, overwrite unrelated local edits, remove volumes or clear application storage. Confirm the deployed commit separately from the repository head.

Check public/login/signup pages and signed-in desktop/mobile navigation, including sidebar collapse, onboarding and logout. Verify the original icons load and the removed custom mark is absent from the build. An already open browser tab needs a reload to load the new JavaScript. The notification service worker does not cache the application shell; leave subscriptions and saved settings intact.

A source commit is not a deployment claim. Earlier commits and the initial publication inventory retain the historical changes; this restoration does not rewrite published history.
