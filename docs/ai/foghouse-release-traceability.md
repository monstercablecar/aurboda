# Foghouse local release traceability

This is the customized local Foghouse workflow, separate from upstream Aurboda's develop/main release process. The versioned entry point is `scripts/foghouse-update.sh`, mirrored to the parent installation's `scripts/update.sh`. Its helper `scripts/foghouse-source-manifest.py` must be installed beside it. Neither changing these files nor running their tests deploys the application.

## Reviewed release input

Stop concurrent source editing, review the intended custom source tree and its `.dockerignore`, and choose a specific release label. The custom source copy is intentionally dirty; its Git HEAD is **not** an exact description of the build input.

```sh
BUILD_SHA=reviewed-release-20261112-01 /home/brighton/.local/share/foghouse-stats/scripts/update.sh
# Equivalent explicit argument:
/home/brighton/.local/share/foghouse-stats/scripts/update.sh reviewed-release-20261112-01
```

Labels allow letters, numbers, dots, underscores and dashes, beginning with a letter/number, at most 96 characters. Missing labels, the old fixed `foghouse-career` label, mismatched argument/environment labels and unsafe characters fail before backup or restart. `FOGHOUSE_INSTALL_ROOT` defaults to the installation above; it exists for explicitly selected alternate installs and stubbed tests, not automatic discovery.

The script locks the update workflow, writes a protected release record, invokes the existing backup script, builds the existing `localhost/foghouse-aurboda:career` tag with the requested BUILD_SHA, verifies that the source manifest did not change, then restarts the existing user service. Health verification requires both `success: true` and **`version` exactly equal to the requested label** from `/api/status`; HTTP 200 alone is insufficient. A mismatch fails after the bounded retry period. No automatic rollback is attempted.

## Manifest and protected record

Each run gets a unique directory under `$INSTALL_ROOT/releases` (directory permissions 0700, created files 0600). It records the requested label, source paths/content hashes/modes, manifest aggregate SHA-256, previous/current image IDs, backup-script output and phase/failure events. It does not read runtime environment files, backup contents or database rows. A manifest is build-input evidence, not a Git revision or a guarantee of reproducible image layers: local base images, toolchains and build-time dependency resolution also matter.

The helper deliberately supports only the checkout's reviewed `.dockerignore` subset: rooted literals, `*`, `?`, `**`, comments, ordered exclusions and literal root-file reinclusion such as `!README.md`. It applies exclusions to directory ancestors and prunes ignored directories. Unsupported character classes, escapes, brace patterns, parent-path patterns, nonliteral/nested reinclusions, alternative ignore files and admitted symlinks fail closed. Unignored sensitive candidates such as `.env*`, `runtime.env`, credential/backup directories and database/private-key file extensions also fail before backup/build. It never hashes an ignored file. This is **not a general Dockerignore implementation**; when ignore syntax changes, review and extend the helper with tests rather than weakening checks or claiming complete Docker compatibility.

The reviewed Dockerignore also excludes `.letta` agent worktrees and `tryouts/CLAUDE.md`, a documentation symlink. These exclusions apply to both the manifest and the actual container context; secret and admitted-symlink checks remain strict.

Before/after hashes detect ordinary source changes during build. They are not an immutable source snapshot and cannot detect a file changed and restored between checks; keep the reviewed source quiescent. The shared image tag can already point to a new image if build succeeds but a later verification fails, even when the running service has not restarted. Inspect the protected record and running image before further action.

## Explicit rollback

Read the chosen run's `previous-image-id`, identify the corresponding prior release/version, and confirm that image still exists. Do not prune images needed for rollback. A code rollback uses the recorded image ID:

```sh
podman tag '<recorded previous image ID>' localhost/foghouse-aurboda:career
systemctl --user restart foghouse-aurboda.service
curl -fsS http://127.0.0.1:8818/api/status
```

Verify the prior expected `version`, not just HTTP success. These commands are manual operational actions, not test commands. Application-image rollback does not revert database migrations or data. Use the existing backup/restore procedure only after deciding whether data restoration is needed; do not automatically restore a backup over newer user data.

## Checks without deployment

```sh
bash -n scripts/foghouse-update.sh
python3 scripts/foghouse-update.test.py
```

The test suite uses temporary fixture source/install directories and stubbed `podman`, `systemctl`, `curl`, `sleep` and backup commands. It covers rejected labels, build failure before restart, wrong-version health responses, successful labels/manifests, stable hashes across ignored changes, and fail-closed exclusions. No real container, network request, service restart or backup is used.
