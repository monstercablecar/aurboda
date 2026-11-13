For this fork, start with [what changed](foghouse-fork.md), the [file inventory](fork-file-inventory.md), and [publication checks](fork-validation.md).

# Documentation directory

For coding work, start with root [AGENTS.md](../AGENTS.md) and [AI onboarding](ai/README.md). The onboarding maps describe the audited customized checkout; existing domain documents remain the detail references. Verify code before treating an older proposal as implemented behavior.

| Need | Read |
| --- | --- |
| Architecture, ownership, APIs and storage | [Backend map](ai/backend-architecture.md), [data storage](data-storage.md), [MCP](mcp-server.md) |
| UI navigation and implemented feature status | [Frontend/feature map](ai/frontend-and-features.md), [web theme](web-theme.md), [Android hybrid architecture](android-app.md) |
| Commands, verified development history and deployment | [History and operations](ai/history-and-operations.md), [Docker](docker.md) |
| Known issues and safe next steps | [Prioritized technical debt](ai/technical-debt.md) |
| Private tasks, projects and preserved health goals | [Native Tasks](native-tasks.md) |
| Work and custom metric dashboards | [Custom dashboards / Work](custom-dashboards.md), [feature map](ai/frontend-and-features.md) |
| Private Foghouse branding and public Aurboda presentation | [Branding scope, logo and verification](foghouse-branding.md) |
| Shared Resources library | [Resources architecture, permissions, storage and operations](resources.md) |
| People | [Architecture and user flows](people.md), [catalog coverage](people-catalog-coverage.md), [reminders](people-reminders.md), [latest verification](people-verification/goals-calendar-questionnaires.md) |
| Treatments and nutrition questionnaire ownership | [Treatments/recovery](features/treatments-recovery.md), [feature map](ai/frontend-and-features.md) |
| CPAP and mental assessments | [CPAP](cpap.md), [assessment instruments](mental-assessments.md) |
| General goals, dashboards and Timeline | [Goals](features/goals.md), [dashboard](features/dashboard.md), [Timeline](features/timeline.md), [calendar imports](calendars.md) |
| Data ingestion | [Source index](data-sources.md); follow its provider-specific documents |
| Activities, comments and analysis | [Activity types](features/activity-types.md), [comments](features/comments.md), [correlations](correlations.md), [trends](features/trends.md), [deduction rules](features/deduction-rules.md) |
| Food, meals and imported records | [Meals](features/meals.md), [food library](livsmedelsverket.md), [lab reports](features/lab-reports.md) |
| Sharing and federation | [Sharing](features/sharing.md), [feed](features/feed.md), [automatic sharing](features/auto-share-rules.md), [protocol documents](fep/README.md) |
| Identity and operations | [Passkeys](passkeys.md), [administration](admin.md), [export](data-export.md), [push pilot](browser-push-pilot.md) |

## Document status

- `docs/ai/` is an evidence-based orientation and status map, not a second set of agent instructions.
- `docs/people-verification/` contains dated implementation checks; a historical passing log is not a fresh test of later changes.
- `PLAN-data-integrity-improvements.md`, `PLAN-calorie-source-separation.md`, and similar planning artifacts are proposals/context. Their existence does not prove delivery.
- `tryouts/AGENTS.md` governs that separate tryout workflow. Read it before working there.
- The local Foghouse installation's parent `README.md`, `scripts/` and `quadlet/` live outside this repository. Their operational scope differs from upstream `aurboda.net`; see [operations](ai/history-and-operations.md).

See [People care implementation and Help Tree](people-care.md) for temporary status episodes, consent-aware tracking, pregnancy timing, lifecycle preservation and current limitations.
