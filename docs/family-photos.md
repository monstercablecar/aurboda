# Family Photos — local private deployment

Family Photos is the non-federated **Marcroft Family** channel. It is a local customization based on production release `96a9916f508e87a3830255a3176b5ee1972d15ff`; it does not change upstream Feed persistence or publication. No GitHub push, PR or image publication is part of this deployment.

## Access and management

Administrators have full access. Under Admin → Users and each account's details, **Family Member** controls an independent `user_accounts.family_member` boolean, initially false. This never changes admin status, billing or personal-data permissions. Members browse and download optimized media, upload photos/videos, and move only their own uploads to trash. Administrators may remove any upload and retain caption editing, protected originals, restoration, folder management and preview retries. Restoration remains administrator-only, including when a member removes their own upload. Originals are administrator-only unless the operator explicitly sets `FAMILY_ALLOW_MEMBER_ORIGINALS=true`.

Every metadata, thumbnail, preview, download, HEAD and range request queries the central database for an existing account, current admin/family status and absence from `deleted_usernames`. Existing sessions therefore stop working on the next request after revocation. Hiding a page remains a display preference, not an access control. Already downloaded bytes cannot be recalled.

The signed-in Home quick-link framework offers **Upload Photo / Video** to all authorized administrators and family members. The page supports sequential multi-file selection, gallery selection, drag and drop, progress, optional captions, gallery/feed views, type filters, date headings, lazy images, cursor pagination, a swipe/keyboard photo dialog and video seeking. Images and videos use generated, metadata-free derivatives. Capture dates are extracted when recognized; administrators can also set them through the private edit API. EXIF timestamps without a timezone are represented as UTC rather than guessing a location.

## Family album interface

The local album redesign keeps the existing private API and storage boundary. The gallery opens with photos, date headings and quiet type/view controls; authorized members reveal the upload panel explicitly (including Home's `#upload` quick entry). Files have individual previews and captions, progress, and retained failures for retry. A queue stops on account change or page exit; temporary browser previews are released on removal or exit and are never persisted.

The full-screen viewer includes arrow/keyboard and photo-only swipe navigation, zoom, a filmstrip and a six-second photo slideshow. Native video gestures remain available for seeking. Captions and administrator actions live in the details panel. Recently removed items show restoration controls without requesting deleted media. The Android browser-download handoff remains required for the existing APK.

Design references: [Google Photos albums](https://support.google.com/photos/answer/6128849?co=GENIE.Platform%3DDesktop&hl=en) for quieter organization/editing, and [Immich features](https://immich.app/features) for timeline, slideshow and drag/drop patterns. These references do not imply full feature parity.

## Folders and date filters

The local album provides one level of folders, a compact From/To date filter and an administrator selection mode for moving up to 200 shown memories at once. Members browse folders and may choose an existing destination during upload. Administrators create, rename and remove folders, and move existing memories through selection or their details panel. Removing a folder unfiles its memories without changing their original bytes, captions or trash status. Duplicate names are rejected without regard to case; the library supports up to 200 folders.

Folders are central metadata in `family_folders`, linked by the existing `family_media.album_id` with `ON DELETE SET NULL`. Folder names never become filesystem paths. The additive migration also creates indexes for folder and memory-date browsing. Back up the matching databases and file volumes before applying it. Rollback to the prior image can keep these additive tables/indexes and the unchanged private media volume; preserve any organization made since deployment.

Date filters include both chosen calendar dates, using the stored capture date with added date as fallback. Calendar grouping and filters follow the viewing device's local dates, using separate boundary offsets across daylight saving changes. Capture timestamps without source timezones still have the existing UTC interpretation. Folder, media type and date filters compose on the server before pagination. The gallery now orders and groups memories by that same capture/fallback date. Folder and move endpoints remain private REST-only, enforce current database-backed access on every request, and retain private/no-store responses. Bulk moves validate all selected memories and the destination transactionally; a missing/deleted item rejects the whole move.

## Member uploads and ownership

Every current family member or administrator may use the existing bounded uploader, including selecting an existing destination folder. Quota, space, type/hash validation and processing limits apply equally. The server records `created_by` from the authenticated request; upload bodies cannot supply or transfer ownership. Private list/detail/upload responses provide only `is_owner` for the current viewer, without exposing the uploader's username.

Members see their own queued/failed uploads as well as all ready active family content, so they can remove a bad or pending upload. They cannot inspect someone else's pending/failed item, remove another member's item, remove an item with null/anonymized ownership, browse trash or restore items. A member's removed media is unavailable through GET, HEAD and range endpoints, including to its uploader. Administrators retain their existing private trash access and restoration. The details panel explains the 30-day administrator recovery window.

Ownership reuses existing server-recorded usernames because deleted account names are permanently reserved by the central account lifecycle. Deleted usernames are rejected even if an account row is accidentally reinserted; the worker clears their upload attribution without deleting shared photos. Membership is rechecked after quota/folder lock waits before uploads commit, and after row-lock waits before a removal. Metadata and media continue to require current database-backed access. No ownership migration, backfill or transfer of existing uploads is performed.

## Privacy boundary

`/family-photos` is an authenticated REST-only module, exposed by the deployment proxy as `/api/family-photos`. This is an explicit exception to upstream REST/MCP parity. There are no family MCP tools, public OpenAPI paths, feed posts/images, ActivityPub deliveries, public profile/dashboard entries, RSS/Atom items, link previews, personal export attachments or external processing calls. Family membership is deliberately outside broad account serialization, which is also used by MCP. Per-user exports cannot contain the central family library or its binaries.

Browser API calls use existing bearer authentication. Native media elements use a five-minute, random opaque, HttpOnly, SameSite=Strict cookie scoped to the family API; it holds no token in a URL. A separate **noncredential** browser identity binding changes synchronously on account, token, logout, cross-tab and native-startup transitions. A late cookie response from the old account cannot match the new binding. Cookie creation requires bearer authentication, matching binding header/cookie, and same-origin requests. Originals always require a fresh bearer-authenticated request; a media cookie cannot authorize an original.

Responses, including errors and ranges, use private/no-store browser and CDN headers. A private Express subapplication disables entity validators. The proxy disables request/response buffering and caches, suppresses family access/error logs and adds no-store even for proxy errors. The notification service worker has no fetch/cache handler. A local error boundary and Sentry filter suppress family exceptions; worker failures retain only a fixed failed status. No filenames, captions, decoder diagnostics or file bytes are sent to external error reporting.

## Storage and processing

Central tables: `family_media`, `family_uploads` and `family_folders`; memories reference folders through a nullable UUID. Binary files live in named volume `foghouse-aurboda-family-photos`, mounted **only** at `/data/family-photos`, outside nginx's public directory. Each generated UUID directory holds `original`, `thumb.webp`, and `preview.webp` or `preview.mp4`. Original filenames are sanitized metadata, never storage paths. The library has no cascading relationship to its uploader; deleted uploader attribution is cleared by maintenance.

Uploads stream to disk after current family/admin authorization and a transactional reservation. A second role check occurs before publication. Reservations cover original, derivative and workspace budgets; quota includes trash, failed originals and outstanding work. SHA-256 detects duplicates, including trash. Configured limits and actual available-space checks reject exhausted storage; incomplete uploads retain durable reservations until cleanup. Files and parent directories are synchronized before database publication.

Content magic, explicit allowlisted containers and decoders replace trust in MIME labels. SVG and playlist uploads are rejected. JPEG, PNG, WebP and AVIF use the existing Sharp dependency in a separate limited process; HEIC uses local libheif, then Sharp. Multi-image HEIC files are retained but not previewed unless they contain a single supported primary image. Videos use local FFmpeg/ffprobe, explicitly restricted to MOV/MP4 demuxing and file/pipe protocols, H.264/AAC previews, one thread, bounded dimensions/duration, stripped metadata/chapters/subtitles/attachments, and thumbnail generation. Size-truncated previews fail validation rather than replacing originals.

A dedicated central-table queue uses a transaction-level advisory lock across instances and row locks; only one conversion runs at a time. A process crash rolls unfinished work back to queued. The next worker recreates the work directory and retries idempotently. Native processes have address-space, file-size, CPU, elapsed-time, output and workspace watchdog limits; descendants are terminated together. Queue payloads never enter ActivityPub or external systems. Existing pg-boss conventions were evaluated; the small private state machine avoids mixing family payloads with other queues.

Deletion is recoverable for 30 days. Expired rows transition to a durable, inaccessible `purging` state before files are removed, so a crash retries cleanup and cannot race a restoration. Conversion failure leaves the original intact and downloadable by administrators. The worker cleans abandoned uploads and old orphan UUID directories.

## Local configuration

Feature defaults off. The local Quadlet enables it, mounts the private volume and retains `Pull=never`; there is no auto-update label.

| Variable                        | Default                                |
| ------------------------------- | -------------------------------------- |
| `FAMILY_PHOTOS_ENABLED`         | `false`                                |
| `FAMILY_STORAGE_DIR`            | Required absolute, nonpublic directory |
| `FAMILY_MAX_UPLOAD_BYTES`       | 94,371,840 (90 MiB)                    |
| `FAMILY_QUOTA_BYTES`            | 53,687,091,200 (50 GiB)                |
| `FAMILY_MAX_DERIVATIVE_BYTES`   | 134,217,728                            |
| `FAMILY_WORKSPACE_BYTES`        | 536,870,912                            |
| `FAMILY_MIN_FREE_BYTES`         | 1,073,741,824                          |
| `FAMILY_MAX_IMAGE_PIXELS`       | 80,000,000                             |
| `FAMILY_MAX_VIDEO_SECONDS`      | 1,800                                  |
| `FAMILY_ALLOW_MEMBER_ORIGINALS` | `false`                                |

The actual deployment binds `operations/family-photos-20261123/nginx.conf`. The family upload path accepts 91 MiB including framing; its 90 MiB application cap stays below the usual 100 MB Cloudflare upload boundary. Increasing the application limit also requires reviewing proxy and Cloudflare account limits. Origin no-store headers are explicit; Cloudflare account rules and device behavior require separate verification.

## Backup, restoration and updates

The installation's `scripts/backup.sh` pauses application writes, enumerates all Aurboda databases, validates custom-format dumps, exports Resources and (when present) the family volume, validates archives, then unpauses. Files are private, with 365-day retention by default. A database dump alone is insufficient for family recovery: restore the **matching central dump and family-volume archive** together while application writes are stopped. Preserve the current installation and newer data first. Restore to an isolated database/volume and validate before any live replacement. Do not restore the pre-feature central database over newer user changes simply to roll back an image.

Image rollback preserves the additive schema and family volume, but the prior image cannot display the module. Turn the feature off and retain files; do not remove the volume. Operational release records include the exact image, source hashes, previous image and matching backups. The old dirty `source/` checkout is preserved and must not be used to replace this deployment. A guard on the legacy updater prevents that while Family Photos is enabled.

Future upstream merges must explicitly retain the private router, central migration, storage/processor, schemas, navigation, account controls, session-boundary integration, Sentry exclusion, volume, backup and proxy changes. Regenerate public API documentation without registering family paths. Run privacy and Feed/Journal regressions after each merge. Do not switch this host to upstream `latest` or publish the private image.

Android's existing WebView provides gallery selection and embedded browsing/playback. Its current native DownloadManager implementation was designed for token-bearing export URLs and does not forward media cookies; individual downloads do not work inside that existing APK. The embedded page visibly directs users to a token-free browser link and hides unsupported download controls; signing into the browser provides the working download path. In-app Android downloads remain incomplete. No token-in-URL workaround is provided. No APK is changed by this web deployment.

See the protected operational report under `operations/family-photos-20261123` for executed checks and explicit verification limits.
