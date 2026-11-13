# GitHub, private data and deployments

GitHub is the source of truth for shared code. Put changes on a focused branch, open a PR into `feat/foghouse-customizations`, review the diff and passing checks, then merge without rebasing. Record the deployed commit separately from the branch head. An open PR or merged commit does not mean the server has been updated.

Keep runtime environment files, database exports, uploaded Resources, account records, browser sessions and raw operational logs outside Git. Ignore rules prevent accidental adds; they do not remove files already committed. Never paste a suspected credential into an issue, PR, workflow log or screenshot.

## Checks

The Secret scan workflow uses a pinned, SHA-256-verified Gitleaks release. It scans all fetched Git history on pushes and PRs with a read-only token and does not persist checkout credentials. Findings fail the job. Public output contains only rule identifiers, file locations and commit fingerprints; secret values and raw reports are not uploaded. Do not make this pass by broadly excluding tests or accepting a whole baseline. Inspect each candidate and document any narrowly scoped false-positive exception.

This is a credential-pattern check, not proof that there is no personal information. Review docs, fixtures, images, commit metadata, PR text, logs and release artifacts too. Contributor attribution and the published server address are identifiable public metadata; they are not API credentials. Personal health, family, employment and account records do not belong in the repository.

If a real credential was exposed, revoke or rotate it first, then remove the source and address retained history/caches with the repository owner. A later deletion commit does not make a published secret private. Do not force-push rewritten history without explicit coordination.

## November 13 audit checkpoint

A local pattern scan inspected 2,665 distinct blobs across the initial Foghouse publication and each published integration snapshot. It found two credential-URL candidates: runtime string interpolation and an `example.com` rejection-test fixture, both non-secrets. No recognizable service tokens, private keys, JWTs or sensitive runtime filenames were found in that scope. This is not a complete scan of inherited upstream history; the GitHub full-history job covers the fetched branch/tag history separately.

The fork had no releases or release assets, one PR and no inline PR review comments at inspection. The PR body contains implementation and validation notes. Documentation and examples include contributor attribution, a local username/path and the public server hostname. Those identifiers remain public, including in commit history. No claim is made that the repository is anonymous or that all possible sensitive data can be detected automatically.

## Live update boundary

The tested application tree is the merge from PR #1, commit `b01a01c244790b52e06ef05c652f4c02e0bb9fde`. Its backend, web and Android CI passed. The server update is authorized but was not executed in the audit session: local service-manager and network-socket access were denied. Do not describe it as deployed until exact-version health checks succeed.

Deploy an immutable checkout of the reviewed commit, not the older dirty source folder. Preserve that folder, take and validate database and Resources-volume backups, retain the running image for rollback, then build with the commit as the release label. Verify local/public `/api/status`, authentication rejection on private APIs, migrations and custom-feature smoke tests. Keep operational evidence private. A code rollback does not reverse database migrations.

The merged upstream release can seed a public Feed relay on HTTPS instances. Review that setting as part of deployment; publishing code does not subscribe the running server. Official APK and container publishing remain restricted to upstream.
