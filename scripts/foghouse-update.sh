#!/usr/bin/env bash
set -euo pipefail
umask 077

# A reviewed release label is required: the custom source copy's Git HEAD is not provenance.
if (( $# > 1 )); then
  echo 'Usage: BUILD_SHA=reviewed-release-id foghouse-update.sh [release-id]' >&2
  exit 2
fi
release_label="${1:-${BUILD_SHA:-}}"
if [[ ! "$release_label" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$ || "$release_label" == foghouse-career ]]; then
  echo 'A specific reviewed release label is required (letters, digits, dot, dash, underscore; not foghouse-career).' >&2
  exit 2
fi
if [[ -n "${1:-}" && -n "${BUILD_SHA:-}" && "$1" != "$BUILD_SHA" ]]; then
  echo 'Argument and BUILD_SHA disagree.' >&2
  exit 2
fi

INSTALL_ROOT="${FOGHOUSE_INSTALL_ROOT:-/home/brighton/.local/share/foghouse-stats}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$INSTALL_ROOT/releases"
mkdir -p -- "$RELEASE_DIR"
chmod 700 -- "$RELEASE_DIR"
exec 9>"$RELEASE_DIR/update.lock"
flock -n 9 || { echo 'Another update is in progress.' >&2; exit 1; }
record_dir="$(mktemp -d "$RELEASE_DIR/$(date -u +%Y%m%dT%H%M%SZ).$release_label.XXXXXX")"
printf '%s\n' "$release_label" > "$record_dir/release-label"
trap 'result=$?; if (( result != 0 )); then printf "failed exit=%s\n" "$result" >> "$record_dir/events.log"; fi' EXIT

python3 "$SCRIPT_DIR/foghouse-source-manifest.py" "$INSTALL_ROOT/source" > "$record_dir/source-manifest.json"
source_hash="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["source_sha256"])' "$record_dir/source-manifest.json")"
printf 'prepared label=%s source_sha256=%s\n' "$release_label" "$source_hash" >> "$record_dir/events.log"
podman image inspect --format '{{.Id}}' localhost/foghouse-aurboda:career > "$record_dir/previous-image-id" 2>/dev/null || true

"$INSTALL_ROOT/scripts/backup.sh" > "$record_dir/backup-output.txt"
printf 'backup-complete\n' >> "$record_dir/events.log"
podman build \
  --build-arg "BUILD_SHA=$release_label" \
  --pull=never \
  --tag localhost/foghouse-aurboda:career \
  "$INSTALL_ROOT/source"
podman image inspect --format '{{.Id}}' localhost/foghouse-aurboda:career > "$record_dir/image-id"
python3 "$SCRIPT_DIR/foghouse-source-manifest.py" "$INSTALL_ROOT/source" > "$record_dir/source-manifest-after.json"
after_hash="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["source_sha256"])' "$record_dir/source-manifest-after.json")"
if [[ "$source_hash" != "$after_hash" ]]; then
  echo 'Source changed during build; refusing to restart. Review the build input and retry.' >&2
  exit 1
fi
printf 'build-complete\n' >> "$record_dir/events.log"
systemctl --user restart foghouse-aurboda.service

for attempt in {1..30}; do
  if response="$(curl -fsS --max-time 2 http://127.0.0.1:8818/api/status)" && \
    python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data.get("success") is True and data.get("version") == sys.argv[1] else 1)' "$release_label" <<< "$response"; then
    printf 'healthy label=%s\n' "$release_label" >> "$record_dir/events.log"
    printf 'Foghouse Stats is healthy at release %s. Record: %s\n' "$release_label" "$record_dir"
    exit 0
  fi
  sleep 2
done

echo 'Foghouse Stats did not report the requested release version in time; inspect the release record before rollback.' >&2
exit 1
