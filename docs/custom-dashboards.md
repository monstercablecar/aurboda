# Private dashboard presets

These presets put work, sleep, treatment and energy data into Aurboda's existing dashboard renderer. They are a starting layout, not another data store or a background job that keeps overwriting your edits.

The bundle creates seven private boards: Life Overview, Sleep & Recovery, Work & Productivity, Supplements & Medications, Energy & Performance, Weekly Review, and Monthly Review. Home stays unchanged. Layouts remain editable in the normal dashboard UI.

## Install

The installer and configuration live in `scripts/custom-dashboards/`. Run them inside your configured application container so they use its shared schemas and authenticated REST handlers. Replace `YOUR_USERNAME` with the intended account. The temporary service token stays in memory and is not printed.

```sh
podman cp scripts/custom-dashboards foghouse-aurboda:/app/scripts/
podman exec foghouse-aurboda node /app/scripts/custom-dashboards/install.mjs YOUR_USERNAME
podman exec foghouse-aurboda node /app/scripts/custom-dashboards/install.mjs YOUR_USERNAME --apply
podman exec foghouse-aurboda node /app/scripts/custom-dashboards/install.mjs YOUR_USERNAME --verify-only
```

The default is a dry run. `--apply` creates missing boards and reuses matching private boards without replacing their layouts. Duplicate names or collisions with nonprivate boards fail before writes. Links are resolved after creation; only newly created board IDs are eligible for those updates. There is no automatic delete or reset. An interrupted installation may need manual link repair.

## What the charts mean

CPAP comes from manual myAir CSV imports. Work summaries describe recorded daily totals; they do not establish hours worked. Health Connect may contain raw records and overlapping daily aggregates: choose a source rather than summing both. Treatment exposure and assessment projections come from their existing services. The boards link to the detailed pages for intake, regimen history and assessment logging.

Check available observations on your installation before choosing widgets. A missing measurement stays missing, not zero. A daily mean uses recorded days. Ratios need compatible numerator and denominator windows; a mean of daily ratios is not a ratio of totals. Weekly and monthly review boards use completed native periods. Use the account time zone consistently.

Correlations are exploratory. Same-day and next-day comparisons answer different questions, and sparse observations do not establish an effect. Source freshness, treatment adherence and work efficiency are not inferred from a dashboard having data.

## Privacy and checks

Boards are private. Verification checks owner access, anonymous denial, schema validity, unique widget IDs, resolved navigation, period windows and safe reruns. No private account identifiers, measurement summaries or installed dashboard URLs are included here.

Earlier local validation recorded 15 setup tests, 47 related web tests and 73 related backend tests passing, plus type and scoped lint checks. Those are historical results, not a current full-suite or phone test. The initial check did not include authenticated desktop/mobile rendering or an Android build. See [fork validation](fork-validation.md) for checks run while preparing the public snapshot.
