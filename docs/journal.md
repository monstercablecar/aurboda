# Journal

Implemented on `feat/foghouse-journal`, reviewed through fork PR #3. Integration and device verification remain pending as noted below; this is not a deployment claim.

## Experience

A dedicated `/journal` page provides a quiet Markdown-capable editor, audio recording and uploads, images, multiple dated entries, search, timeline/calendar navigation, favorites/pins, optional tags and areas, local draft recovery, conflict-aware autosave, revision recovery and trash. General is the default area; organizing entries is optional. Area management preserves entries when an area is removed.

`/journal/prompted` contains 30 guided options: 20 wellbeing/life-reflection resources and 10 creative adaptations. Users can resume, skip optional prompts, repeat attempts and export answers. Catalog items retain source authors, licenses, adaptation notices and immutable versioned questions. Short companion exercises must not be represented as complete reproductions of the original books. See the content manifest for exact provenance and exclusions.

Personal templates preserve prior entries when edited. Entries may link to existing People, questionnaire, event and journal records without duplicating their measurements or notes. No transcription, clinical scoring or automatic AI processing is added. Optional resurfacing respects per-entry exclusions. Notifications use an existing supported shared infrastructure only; this feature introduces no new scheduler.

## Data contract

Shared types and validation are in `packages/api-spec/src/schemas/journal.ts`. Journal content is Markdown/plain text rather than trusted HTML. Areas are separately identified; `area_id: null` means General. Entries carry creation/update timestamps and a user-selected occurrence time. PATCH uses mandatory `expected_updated_at`; stale writes return 409 rather than silently destroying another edit. Trash and permanent deletion are distinct actions. Revisions preserve earlier content.

Workbook attempts are journal entries with a stored definition snapshot, answers keyed by stable prompt identifiers, completed sections, resume section and status. The server chooses the definition when starting an attempt and refuses later definition replacement. A repeat creates a new attempt. Catalog updates do not rewrite past responses.

The API prefix is `/journal`, with `/entries`, `/areas`, `/templates`, `/catalog`, entry `/revisions` and `/attachments`, and authenticated `/attachments/:id` downloads. All owner selection comes from authenticated server context. MCP domain tools call the same services; existing authorization and opt-in AI connection behavior remain unchanged.

## Export and other-agent handoff

The existing Settings export is a PostgreSQL account dump (`services/export-dump.ts`), not a hand-maintained JSON list. Journal tables and original attachment bytes live inside the same per-user database so the normal dump includes them. The existing dump/restore integration test now seeds all six Journal tables, including binary audio, and compares their restored rows. This test has not run locally because the container runtime is unavailable. A binary attachment must not be replaced by an expiring URL in a backup.

The separate export/MCP/privacy task can inspect the Journal API and tables after this branch lands. It owns broader export UX, consent/authorization review and the Foghouse Privacy policy/footer. This Journal branch does not alter that policy, introduce administrator impersonation or change global authentication. Existing administrator operations remain available; the Journal must still enforce ordinary user isolation.

Browser draft recovery is not a server backup. Unsaved local-only text and recordings are not included in Settings exports. Journal-specific portable downloads supplement rather than replace the database dump. PDF output through browser printing is described as Print / Save as PDF, not as server-generated PDF.

## Verification

Local verification on 2026-11-13:

- Shared API build/check, OpenAPI/TypeScript/Kotlin model generation, backend check and web check pass. Repository-wide checks retain pre-existing lint warnings.
- Journal backend unit coverage: 13 tests pass for contracts, catalog, service validation and MCP discovery. Catalog contains 30 definitions and 186 optional prompts.
- Web production build passes. Full web suite reports 1,938 passing tests; the existing DST child-process test is blocked by sandbox `spawnSync ... EPERM`. Focused Journal tests cover concurrent autosave, response-loss retries, recovery, conflict copies, session changes and audio controls.
- Database integration tests cannot start: no working container runtime. HTTP route tests cannot bind: `listen EPERM`. They remain required in CI, including the Settings dump/restore test.
- Real microphone capture, visual mobile/browser checks and full account-to-account integration verification are not claimed from unit tests. PR remains draft pending these checks.

MCP has 19 Journal tools, including read/write/search, workbook attempts, revisions, areas, templates and attachment operations. Base64 MCP transfer is capped at 1 MiB; authenticated REST supports original files up to 20 MiB. No transcription or automatic model request is made. The optional AI connection uses the existing auth and read-only policy.

Journal-specific JSON/Markdown downloads respect selected filters across all pages; the media JSON archive includes original attachment bytes as data URLs. These portable downloads are not a new database restore UI. Print uses the browser's Save as PDF. On-this-day is opt-in and scans prior-year entries, respecting each entry's resurfacing setting.

Android source adds an embedded Journal menu entry. Existing Android WebView microphone permission bridging is absent; browser microphone support does not establish Android recording parity. Physical-device microphone, upload, blob download and print checks remain open. An attempt to file the required parity issue failed because Issues are disabled on this fork; track the gap in PR #3 until Issues are enabled. No APK is built or distributed.

The page links existing People profiles and saved mental-assessment results into new unsaved reflections. Other event/entry references can be added as metadata in the editor. Links do not copy source notes or grant access to another account's data.

Use synthetic data only for future verification. No live deployment or production-user inspection is part of this implementation.

## Privacy/export integration follow-up

The separate privacy/integration branch now reuses these exact Journal services and database tables.
Its read-only OAuth allowlist includes Journal discovery, filtered/paginated search, complete entry
and workbook-snapshot reads, areas/templates/revisions and attachment metadata/original bytes.
`get_journal_capabilities` / `GET /journal/capabilities` reports supported filters and transfer limits;
`workbook_id` narrows attempts without a separate workbook storage model.

Valid OAuth read tokens can also use the existing Journal REST GET/HEAD paths, including original
media over the 1 MiB MCP response limit. Journal REST writes retain account-token authentication;
write-authorized MCP clients retain the existing mutating tools. Read grants do not gain edits,
deletions, credential-bearing exports or connection administration. Revocation is available in
Settings → AI and MCP connections. See [data access](data-access.md), [MCP permissions](mcp-server.md)
and [Journal export/verification](ai/journal-data-integration.md).

The combined-image nginx configuration allows 21 MiB for Journal multipart requests (20 MiB file
limit) and disables proxy disk buffering and Journal access logging. Outer proxy/provider behavior
and device recording remain separate operational checks. The expanded real SQL roundtrip fixture
is still unexecuted here because no container runtime is available. Focused synthetic HTTP tests
can bind in this integration environment; that does not establish production or device behavior.
