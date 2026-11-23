#!/usr/bin/env bash
set -euo pipefail

: "\${DATABASE_URL:?Set DATABASE_URL to the application PostgreSQL database}"
: "\${AGE_RECIPIENT:?Set AGE_RECIPIENT to the public age recipient key}"
: "\${BACKUP_REMOTE:?Set BACKUP_REMOTE to an rclone destination, e.g. backups:universal-erp}"

for command in pg_dump age rclone; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required backup command not found: $command" >&2
    exit 1
  }
done

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="\${BACKUP_REMOTE%/}/universal-erp-\${timestamp}.dump.age"

# The dump is encrypted in the pipeline; no plaintext dump is written to disk.
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  | age --recipient "$AGE_RECIPIENT" \
  | rclone rcat "$destination"

echo "Encrypted ERP backup uploaded to \${destination}"
