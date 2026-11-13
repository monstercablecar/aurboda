# AI onboarding: customized Aurboda

Audit baseline: HEAD `e6cd290`, read November 12, 2026 (America/Denver), plus the explicitly identified working-tree additions below. This is a source audit, not a deployment assertion. Resources and Treatments work were actively changing during this pass; inspect `git status` before relying on a statement about pending code. No runtime secrets, live database rows or backups were read, and no application behavior was changed by this documentation pass.

Committed People includes the child guide, useful metrics, private important-date calendar and temporary care episodes. Start at [People care](../people-care.md) for the status lifecycle, consent, pregnancy estimates, milestones and Help Tree contract; [care evidence](../people-care-evidence.md) separates source review from scenario-based empathy review, neither of which is independent clinical approval.

## First ten minutes

1. Read root [AGENTS.md](../../AGENTS.md), including its existing instructions below the navigation block. Run `git status --short`, `git log -5 --oneline`, `node --version`, and `pnpm --version`.
2. Identify your checkout. In the audited local workspace, `people-implementation/` is the committed development copy; sibling `source/` is the customized build input for Foghouse deployment and contains pre-existing uncommitted work. They are not interchangeable clean clones. Do not reset either to upstream or copy whole trees over one another. Outside this workspace, inspect your actual remotes and filesystem instead of assuming these siblings exist.
3. Find the feature in [frontend and feature status](frontend-and-features.md). Follow its router → API adapter → server service → database/schema path in [backend architecture](backend-architecture.md).
4. Read the feature's existing document from the [documentation directory](../README.md), then inspect the actual code and adjacent tests. Plans and draft schemas are not evidence of active functionality.
5. Read [account/session isolation](account-isolation.md) before changing login, caches or async callbacks, and [audit privacy](privacy-hardening.md) before adding logging.
6. Consult [technical debt](technical-debt.md) before proposing another implementation. Pick the smallest existing extension point and define a test that exercises observable behavior.

## Repository orientation

| Path                                                                        | Purpose / first inspection                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/backend/src/api.ts`                                                   | Express startup, dependencies, services, jobs and shutdown; there is no backend `src/index.ts` entrypoint. |
| `apps/backend/src/api/rest-routes.ts`                                       | Main REST mounting map; feature routers live in `routes/`.                                                 |
| `apps/backend/src/mcp.ts`, `apps/backend/src/mcp/`                          | MCP registration and domain adapters; reuse the same services as REST.                                     |
| `apps/backend/src/services/`, `apps/backend/src/db/`                        | Business rules and persistence; not interchangeable layers.                                                |
| `apps/backend/src/schema.ts`, `apps/backend/src/schema/`                    | Registered per-user DDL and dependency order; a file under `schema/` is not automatically registered.      |
| `packages/api-spec/src/schemas/`                                            | Shared Zod contracts and inferred types. Build this workspace before consumers.                            |
| `packages/api-spec/src/openapi.ts`, `packages/api-spec/src/people-paths.ts` | OpenAPI registration, including People paths; Resources paths are a pending working-tree addition.         |
| `apps/web/src/index.tsx`, `apps/web/src/components/nav-links.ts`            | Routed pages and navigation; Preact, not a separate React application.                                     |
| `apps/web/src/state/api/`, `apps/web/src/state/auth.ts`                     | Browser API adapters and authentication state.                                                             |
| `apps/android/`                                                             | Hybrid Android client; embedded web screens plus native device integrations.                               |
| `docs/`, `tryouts/`, `.github/workflows/`                                   | Feature references, separate post-merge tryout instructions, and actual CI procedures.                     |
| `apps/configurable-work-engine/`                                            | Unregistered draft code, not the running `/work` service.                                                  |

## Development and verification

Use Node **26** and root-pinned pnpm **10.33.4** (`package.json`, `.nvmrc`). The root package manager pin governs workspace setup; a nested package may retain an older metadata pin.

```sh
pnpm install --frozen-lockfile
pnpm --filter @aurboda/api-spec build
pnpm --filter aurboda-web typecheck
pnpm --filter aurboda-web test
TZ=UTC pnpm --filter aurboda-backend exec vitest run --project unit-shared --project unit-isolated
pnpm --filter aurboda-web build
```

These commands are verified against package scripts/configuration; installation is not a prerequisite for a documentation-only review of an already prepared checkout. Backend integration tests additionally need a working Docker-compatible daemon. Start with a relevant file, for example:

```sh
pnpm --filter aurboda-backend exec vitest run src/services/people.integration.test.ts
```

`pnpm check` is the aggregate type/lint check. The invalid, unregistered Work draft was quarantined in `docs/experiments/work-schema.ts.txt`; backend typecheck now passes. See [debt](technical-debt.md) for remaining findings. A passing typecheck alone does not establish that all integration or native checks passed. Root `pnpm test` and `pnpm build` include Android; Android needs its SDK/JDK toolchain. Root `pnpm fix` writes across the repository—use scoped formatting for narrow changes and do not run it during a documentation-only task.

For local development, inspect `.env.example`, `apps/backend/src/api.ts`, `apps/backend/src/services/central-db.ts`, `apps/backend/src/db/connection.ts`, `apps/web/src/config.ts`, and `docker-compose.dev.yml`. Configure a separate development database. Run `pnpm dev:backend` and `pnpm dev:web` in separate terminals only after choosing explicit development ports and settings. Backend defaults to port 80; do not mistake that for a safe unused development port. Web API configuration comes from runtime `window.__RUNTIME_CONFIG__.API_URL` or `VITE_API_URL`. Never use the production environment file as a test fixture.

See [operations](history-and-operations.md) for code generation, CI, container tests and deployment. Temporary Node installations, local dependency symlinks and the preview login harness used during development are not supported product configuration or portable setup instructions.

## Safe extension checklist

- Start at a registered route and verify its callers. Search with `rg`; narrow to the domain before scanning the entire repository.
- Add shared snake_case schemas/types first. REST uses `typedRouter`; MCP should call the same authoritative service. Browser code imports shared types instead of duplicating validation/rules.
- Preserve omitted-field PATCH semantics. Zod defaults inside partial schemas previously reset fields; People explicitly removes those defaults. Distinguish absent values, explicit clears, unknown answers and zero.
- Choose the correct storage boundary. Generic metrics can be shared; person-owned notes/observations must remain in People storage unless sharing is deliberately redesigned.
- Treat calendar dates and instants differently. People recurrence is server-owned; Timeline consumes returned bounds; Google links copy one occurrence. Do not infer years or biology from optional fields.
- Keep provenance, stable identifiers and correction history. Work daily totals, category grids, metric goals, profile goal preferences and People goal events are different concepts.
- Add expand-only registered DDL, preserve deployed readers/writers, and test ownership/isolation and old data. Do not activate the Work draft schema as a shortcut.
- Test the changed behavior, then relevant regressions. Do not invent an integration result from a passing unit suite or call generated Android models an Android build.
- Update existing domain docs and the feature status/debt maps if behavior changes. Record evidence and limitations, not speculative history.

## Evidence and maintenance rules

The code and checked-in tests are authoritative. The maps use repository-relative paths and symbol names so a new agent can retrieve the relevant implementation without rereading the conversation. Operational observations are dated. A recommendation is not implemented functionality. Existing `PLAN-*` documents describe proposals unless the registered implementation independently confirms them.

When updating these guides, check every relative link/path, keep the root entrypoint short, and avoid duplicating API schemas or long lists already maintained in domain documents. Never include credentials, tokens, private health records, live database rows, or backup contents.

## Pending-work boundary

At inspection, Resources changes modified REST/MCP/central DB composition, shared schema exports, navigation, proxy/container configuration and auth logout behavior, and introduced untracked Resources services/routes/UI/tests. The pending `docs/resources.md` describes that current working tree; it is not proof that the feature is committed or deployed. Treatments changes include pharmacology and Today/ConfirmRegimen behavior and tests. Preserve both sets of unrelated edits. The Help Tree graph is documented in `docs/people-care.md`; its shared authenticated metadata/evaluation API remains the source of domain rules.

For a focused change, identify ownership with `git diff --stat` and inspect the relevant diff before editing. Do not run repository-wide formatting or stage whole directories containing another chat's work. Recheck the working tree after an agent finishes because file ownership and counts can change during this audit.

## Documentation audit verification

This refresh checked local links, package scripts, Node/pnpm pins, CI/test configuration, startup/routes, private/central storage and recent People contracts against source. It did not install dependencies, run application suites, deploy, or inspect production configuration. Historical test results belong in [operations](history-and-operations.md) and feature verification records, with their exact revision and scope; they are not a current all-green claim. All 216 local Markdown links in the root agent guide, these AI guides and People care document resolved. Root `AGENTS.md` was preserved with its existing onboarding links and instructions. The separate graph implementation is commit `0acf375`; its application checks are recorded in `docs/people-care.md`.

## November 12 hardening follow-up

The [privacy](privacy-hardening.md), [account-isolation](account-isolation.md), [atomic Work save](../work-day-saving.md), [spouse context](../people-marriage.md) and [local release](foghouse-release-traceability.md) guides describe subsequent implementation. Read [technical debt](technical-debt.md) for resolved versus remaining findings. The original documentation-only audit statements above describe that earlier pass, not these later code changes.

Latest follow-up release: `people-hardening-1d1b24d`; see [verification and remaining limits](../people-verification/hardening-marriage.md).

Deferred product proposals: [engagement ideas](../plans/engagement-ideas.md). These are saved for later, not an approved implementation plan.

For account downloads and migration claims, read [account export coverage and tests](account-export.md) and the [restore guide](../data-export.md).

For the Home arcade, read [Foghouse games](foghouse-games.md): memory/reaction protocols, private assessment saves, limitations, software licenses and verification.

Deployment history: [release log](release-log.md), including backup evidence, failed attempts and operational follow-ups.

Privacy/integration reference: [data access](../data-access.md), [Foghouse policy](../foghouse-privacy.md),
and [Journal integration and remaining verification](journal-data-integration.md). Journal storage is integrated; its real database restore tests remain unexecuted in this environment.

Current privacy/Journal integration checks and blockers: [verification record](privacy-integration-verification.md).
