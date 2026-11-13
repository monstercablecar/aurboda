# Resources

Resources is the authenticated, globally shared library at `/resources`. It adds folders, files and external links to Aurboda's existing navigation. It does not create private libraries, public shares, collaboration, version histories, transcoding, OCR, indexing or AI processing.

## Permissions and identity

| Operation                                     | Anonymous         | Authenticated user | Existing Admin |
| --------------------------------------------- | ----------------- | ------------------ | -------------- |
| List/search folders and resource metadata     | Denied            | Allowed            | Allowed        |
| Preview, stream and download files            | Denied            | Allowed            | Allowed        |
| Open an external link                         | No library access | Allowed            | Allowed        |
| Create/edit/move/delete folders and resources | Denied            | Denied             | Allowed        |
| Upload files                                  | Denied            | Denied             | Allowed        |

Resources uses the central database's existing Admin membership, checked on server mutations. Browser controls are presentation only. Shared records have creator attribution, not user ownership. Revoking Admin membership must prevent subsequent mutations even if a browser still has a stale `is_admin` flag. Existing authentication, deleted-user checks and account write restrictions remain applicable.

## Implementation map and data model

- `packages/api-spec/src/schemas/resources.ts` owns shared validation/types; `resources-paths.ts` registers OpenAPI contracts. Regenerate API/TypeScript/Kotlin models when changing contracts.
- `apps/backend/src/services/central-resources.ts` defines additive, idempotent DDL installed by `central-db.ts` during central database initialization. No per-user schema migration is involved.
- `resources_folders`: UUID primary key, title, nullable parent-folder foreign key, creation/update timestamps.
- `resources_items`: UUID primary key, title, kind, original filename or external URL, unique generated storage UUID, MIME, byte count, nullable parent-folder foreign key, description, creator username, creation/update timestamps. Storage keys are omitted from public metadata.
- `resources_pending_uploads`: storage UUID reserved before the first bytes are written, plus timestamp. Publishing metadata removes the reservation in the same database transaction.
- `resources_pending_deletions`: durable storage UUID tombstones. Deleting metadata and scheduling byte deletion commit together; unlink failures remain retryable.
- `services/resources.ts` owns authorization, metadata, hierarchy transactions and cleanup. `services/resources-storage.ts` owns path containment, signature checks and disk operations. `routes/resources-router.ts` owns multipart transport and content streaming.

All hierarchy mutations use a PostgreSQL transaction advisory lock. Foreign keys reject nonexistent parents; explicit descendant checks reject cycles. Updates accept `expected_updated_at` and return 409 for a stale edit. Omitting that field permits serialized last-write-wins API updates; the web editor sends it. Duplicate names are not unique constraints.

## HTTP and MCP APIs

Paths below are backend paths; the bundled nginx publishes them below `/api`.

| Method/path                                    | Authorization and behavior                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /resources`                               | Authenticated; all metadata plus current `can_manage`                                            |
| `POST /resources/folders`                      | Admin; create folder, 201                                                                        |
| `PATCH /resources/folders/:id`                 | Admin; title/parent update                                                                       |
| `DELETE /resources/folders/:id?recursive=true` | Admin; explicit confirmation required for nonempty folders                                       |
| `POST /resources/links`                        | Admin; HTTP/HTTPS URL, title, optional description/parent, 201                                   |
| `PATCH /resources/items/:id`                   | Admin; metadata/move; external URL only for links                                                |
| `DELETE /resources/items/:id`                  | Admin; metadata deletion plus durable byte cleanup                                               |
| `POST /resources/upload`                       | Admin before parsing; one multipart `file`, `title`, optional `parent_id` and `description`, 201 |
| `POST /resources/session`                      | Authenticated; establish media-only cookie; allowed for read-only accounts                       |
| `DELETE /resources/session`                    | Clear/revoke the presented media cookie; requires no login and grants no access                  |
| `GET`, `HEAD /resources/items/:id/content`     | Authenticated bearer or scoped cookie; safe preview, availability, byte ranges                   |
| `GET /resources/items/:id/content?download=1`  | Same authentication; original filename attachment                                                |

The web adapter uploads multiple selected files sequentially, reports upload progress and keeps per-file failures visible. There is no URL fetching. Link validation rejects credentials and every scheme except HTTP/HTTPS. Content responses set `private, no-store`, `nosniff`, a sandbox CSP, and safe Content-Disposition. Missing files return a useful 404. Oversized uploads return 413, mismatched/unsupported types 415 and insufficient storage 507.

`mcp/resources-tools.ts` registers listing and folder/link/item mutations through the same service. MCP callers use the authenticated multipart HTTP endpoint for bytes; tools never read arbitrary server paths, accept large base64 payloads, or fetch remote URLs. This is an intentional transport limitation rather than an additional upload implementation.

## Media sessions and frontend flow

The web page is `apps/web/src/pages/Resources/index.tsx`, with scoped theme styles and the adapter in `state/api/resources.ts`. `index.tsx` registers `/resources`, `components/nav-links.ts` provides the navigation entry, and the page is available through web navigation. Listing loads metadata once; search across the complete metadata set, filtering and sorting happen in the browser. Navigation keeps the current folder in component state and breadcrumbs derive from parent IDs. Refreshing the page returns to root. Focus and mutation refreshes update live Admin controls.

The browser sends its existing bearer token for metadata and uploads. Before mounting an image, PDF iframe or native video, it establishes a random opaque HttpOnly, SameSite=Strict media cookie, then checks content availability with HEAD. The cookie path derives from `API_BASE_URL`, including its `/api` prefix. HTTPS configuration sets Secure even behind a TLS-terminating tunnel. Tokens never appear in content URLs, and cookie authentication is accepted only on content reads. Every content read still passes the existing authentication/deleted-user checks.

Media sessions expire after 15 minutes and are refreshed every 10 minutes while a preview is open. Logout attempts to revoke the cookie; if the browser cannot contact the server, expiry bounds remaining access. Sessions are process-local, bounded to 10,000 entries and cleared by restart. Reopen/retry a preview after restart. Multiple replicas require sticky routing or a future shared session mechanism. Production is same-origin; cross-origin development requires credentialed CORS configured for a trusted frontend origin or a same-origin development proxy.

## Supported types and previews

| Extensions                                              | Display                                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| PDF                                                     | Native browser PDF viewer and download                                                       |
| JPEG/JPG, PNG, WebP                                     | Inline image and download                                                                    |
| MP4, WebM                                               | Native video with authenticated byte ranges and download; codec support is browser-dependent |
| TXT, CSV, RTF, DOC/XLS/PPT, DOCX/XLSX/PPTX, ODT/ODS/ODP | Metadata and attachment download                                                             |
| External HTTP/HTTPS links                               | Open link in a new tab; no download label                                                    |

Validation reads at most 4 KiB of file content and checks extension/signature plus media MIME where applicable. Office containers receive basic ZIP/OLE signature checks and remain attachment-only; their internal structure/macros are not scanned. HTML/SVG and unlisted extensions are rejected. PDF rendering depends on the browser, and PDF iframe load failures are less observable than image/video errors; HEAD detects missing storage before preview. No conversion, thumbnails, malware scanning or content sanitization is performed. Do not treat an accepted signature as a guarantee that a document is harmless when opened in another application.

## Failure recovery and security invariants

Files have generated UUID keys, never user-controlled paths. Original names reject traversal separators, control characters and hidden/unsafe names. Storage path resolution rejects symlink roots; content checks reject symlinks and non-files. The storage root must be writable only by the application/operator.

Uploads stream to disk and have a one-hour transfer deadline. Failed metadata/signature validation schedules cleanup. A process crash or aborted multipart upload can leave a tracked pending upload; reservations older than 24 hours are reclaimed during startup or a later management operation. Persistent deletion failures retain tombstones and log retry errors. Repair disk permissions/capacity, then restart or perform a management operation to retry. A quiet server has no periodic cleanup worker. Do not manually remove ledger rows before investigating corresponding bytes.

## Storage and deployment

Metadata belongs in the existing central `aurboda` PostgreSQL database, separate from per-user health databases. File bytes belong on server-controlled persistent storage. The container configuration mounts `/data/resources`; never serve this directory through nginx static hosting.

| Setting                      | Default           | Meaning                                               |
| ---------------------------- | ----------------- | ----------------------------------------------------- |
| `RESOURCES_STORAGE_DIR`      | `/data/resources` | Absolute persistent directory writable by the backend |
| `RESOURCES_MAX_UPLOAD_BYTES` | `268435456`       | Per-file limit (256 MiB)                              |

The example Compose configuration mounts named volume `resources_data`. The Foghouse Quadlet template mounts `foghouse-aurboda-resources`. Installing that template and restarting the service are deployment steps, not effects of editing the template. For a local development server, set a writable absolute directory explicitly. Never point tests at production storage.

The resource-specific nginx location allows 257 MiB to cover a 256 MiB file plus multipart framing, disables request and response disk buffering, and permits longer transfers. Other API routes keep their existing limits. If raising the application limit, also change nginx's resource location and check any outer proxy/tunnel limit. The smallest limit wins; an outer proxy may reject a request before Aurboda can return its own error message.

## Naming and hierarchy

Duplicate visible names are allowed. IDs distinguish records and generated storage keys distinguish bytes, so uploading the same name never overwrites another upload. Original filenames remain download names; titles can be changed independently. Folders sort alphabetically. Root is represented by a null parent. Folder moves must reject self-parenting and cycles, including concurrent conflicting moves. Deleting a nonempty folder requires explicit recursive confirmation and removes its descendants and contained resources.

## Backup and restoration

Database-only backups do **not** back up resource files. Back up both the central database and the entire resource volume. The deployed Foghouse backup script now does this automatically and briefly pauses application writes while capturing both. Existing per-user database exports are not exports of the shared library. Do not delete a volume when replacing an application container.

For a consistent maintenance backup:

1. Stop the application (leave PostgreSQL running) so uploads and deletions cannot race the snapshot.
2. Run the existing database backup procedure and verify the central `aurboda` archive.
3. Export the resource volume to a restricted backup archive; for the Foghouse template, use `podman volume export foghouse-aurboda-resources --output <backup-directory>/resources-<timestamp>.tar`. Verify the archive can be listed and retain it alongside the database backup.
4. Restart the application and verify authenticated listing, a preview and a download.

Restore the matching database and resource-volume snapshot with the application stopped. Preserve the existing volume and database first. Verify directory ownership/permissions, then restart and test with both an ordinary user and an Admin. Restoring a database without its corresponding files produces unavailable resources; restoring old bytes alone does not restore deleted metadata. Never expose backups publicly. Apply the same retention and access rules to bytes as to database archives.

## Extension rules

Keep resource IDs, generated storage keys and stored MIME/kind fields stable. Add new types through the shared schema/type allowlist, bounded server signature validation and preview presentation, with tests for accepted and rejected content. Existing unsupported types must remain downloadable when adding a new preview. Active content must not become executable inline merely because its filename or claimed MIME type looks familiar.

Future thumbnails, search indexes or conversion outputs should be derived artifacts with explicit cleanup, not replacements for original files. Future sharing must introduce deliberate authorization instead of making the storage directory public. Preserve expand-only database migrations for overlapping deployments. Keep all transports on the same service authorization and hierarchy invariants.

## Verification and limitations

Verified on November 12, 2026 using Node 26.13.0 and pinned pnpm:

| Check                                                                                                            | Result                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Backend storage, account-gate and central database regressions plus real-PostgreSQL Resources HTTP/service tests | 124 tests passed, including 11 integration cases                                                                                   |
| Full web suite                                                                                                   | 161 files / 1,577 tests passed before the final error-message helper regression was added                                          |
| Final focused Resources, API error, navigation and layout tests                                                  | 15 tests passed                                                                                                                    |
| Web typecheck/check and production build                                                                         | Passed; existing lint and large-bundle warnings remain                                                                             |
| API-spec build/check and OpenAPI, TypeScript, Kotlin generation                                                  | Passed; generated Resources Kotlin booleans inspected                                                                              |
| Scoped new backend/shared-contract lint                                                                          | Zero warnings/errors                                                                                                               |
| Browser fixture inspection                                                                                       | Eight combinations: Admin/reader × desktop/mobile × light/dark; search, filters, dialog Escape and unclipped card controls checked |
| nginx configuration in an isolated existing image                                                                | `nginx -t` passed                                                                                                                  |
| Root `pnpm check`                                                                                                | Fails on pre-existing `apps/backend/src/schema/work.ts:1` TS2834 (extensionless import), reproduced before Resources changes       |
| Android build/tests and physical-device playback                                                                 | Not run: Android SDK/compiler unavailable                                                                                          |

The PostgreSQL tests use disposable databases and temporary storage, not production data. HTTP coverage includes anonymous/ordinary-user rejection, live Admin revocation, nested/cyclic/concurrent moves, stale edits, persisted metadata from a fresh service, upload validation, failed deletion retry, aborted upload recovery, original Unicode filenames, authenticated HEAD/download and MP4 range/suffix/416 responses. The video fixture verifies byte transport, not codec decoding.

Resources is web-only for this deployment, as requested. No APK update is required or produced; use the web application on desktop or mobile. The Android app continues its existing integration role.

## Foghouse deployment — November 12, 2026

Released as `resources-4ef0930b949e` at `https://stats.foghouse.org/resources`. Reviewed feature changes were applied to the deployment `source/` checkout while preserving unrelated customizations. This is a web-only release; no Android APK was built or required.

- Container has the persistent `foghouse-aurboda-resources` volume mounted at `/data/resources`, with the 256 MiB application upload limit.
- Central initialization installed all four Resources tables. Local and public status returned the release label; `/resources` returned 200 and anonymous metadata, content and upload requests returned 401 without redirects.
- A temporary sentinel verified disk read/write access and was removed immediately. Authenticated behavior was covered by the isolated integration suite; no signed-in production browser session was available for an additional user-interface smoke test.
- The exact nginx metadata location prevents automatic slash redirects and HTTP downgrade behind the tunnel. The fix is part of the built image, not only a live configuration change.
- The backup script now includes the Resources volume and verifies the tar archive. It briefly pauses the running application while taking matching database/file backups, then resumes it; EXIT/signal cleanup attempts to resume even if backup fails. Retention is the existing `FOGHOUSE_BACKUP_RETENTION_DAYS` setting. Pre- and post-deployment backup archives were verified.
- Previous image retained as `localhost/foghouse-aurboda:before-resources-20261112`. For application rollback, retag that image as `localhost/foghouse-aurboda:career` and restart `foghouse-aurboda.service`; preserve the new volume and expand-only tables. Restore data only from a deliberate matching database/file snapshot.
