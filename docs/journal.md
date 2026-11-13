# Journal

Implementation in progress on `feat/foghouse-journal`. This document describes the approved scope and integration contracts, not a deployment claim.

## Experience

A dedicated `/journal` page provides a quiet Markdown-capable editor, audio recording and uploads, images, multiple dated entries, search, timeline/calendar navigation, favorites/pins, optional tags and areas, local draft recovery, conflict-aware autosave, revision recovery and trash. General is the default area; organizing entries is optional. Area management preserves entries when an area is removed.

`/journal/prompted` contains 30 guided options: 20 wellbeing/life-reflection resources and 10 creative adaptations. Users can resume, skip optional prompts, repeat attempts and export answers. Catalog items retain source authors, licenses, adaptation notices and immutable versioned questions. Short companion exercises must not be represented as complete reproductions of the original books. See the content manifest for exact provenance and exclusions.

Personal templates preserve prior entries when edited. Entries may link to existing People, questionnaire, event and journal records without duplicating their measurements or notes. No transcription, clinical scoring or automatic AI processing is added. Optional resurfacing respects per-entry exclusions. Notifications use an existing supported shared infrastructure only; this feature introduces no new scheduler.

## Data contract

Shared types and validation are in `packages/api-spec/src/schemas/journal.ts`. Journal content is Markdown/plain text rather than trusted HTML. Areas are separately identified; `area_id: null` means General. Entries carry creation/update timestamps and a user-selected occurrence time. PATCH uses mandatory `expected_updated_at`; stale writes return 409 rather than silently destroying another edit. Trash and permanent deletion are distinct actions. Revisions preserve earlier content.

Workbook attempts are journal entries with a stored definition snapshot, answers keyed by stable prompt identifiers, completed sections, resume section and status. The server chooses the definition when starting an attempt and refuses later definition replacement. A repeat creates a new attempt. Catalog updates do not rewrite past responses.

The API prefix is `/journal`, with `/entries`, `/areas`, `/templates`, `/catalog`, entry `/revisions` and `/attachments`, and authenticated `/attachments/:id` downloads. All owner selection comes from authenticated server context. MCP domain tools call the same services; existing authorization and opt-in AI connection behavior remain unchanged.

## Export and other-agent handoff

The existing Settings export is a PostgreSQL account dump (`services/export-dump.ts`), not a hand-maintained JSON list. Journal tables and original attachment bytes are planned inside the same per-user database so the normal dump includes them. A binary attachment must not be replaced by an expiring URL in a backup. Verify a dump/restore round trip before claiming tested restore support.

The separate export/MCP/privacy task can inspect the Journal API and tables after this branch lands. It owns broader export UX, consent/authorization review and the Foghouse Privacy policy/footer. This Journal branch does not alter that policy, introduce administrator impersonation or change global authentication. Existing administrator operations remain available; the Journal must still enforce ordinary user isolation.

Browser draft recovery is not a server backup. Unsaved local-only text and recordings are not included in Settings exports. Journal-specific portable downloads supplement rather than replace the database dump. PDF output through browser printing is described as Print / Save as PDF, not as server-generated PDF.

## Verification

Record actual checks and limitations here before the PR is ready. Required coverage includes optimistic concurrency, recovery, workbook version preservation, area reassignment, attachment ownership and binary preservation, REST/MCP parity, normal-account isolation, exports, mobile layouts and safe Markdown rendering. Use synthetic data only. No live deployment or production-user inspection is part of this implementation.
