#!/usr/bin/env bash
# Only for ephemeral GitHub CI PostgreSQL (never against production).
set -euo pipefail
: "${PGPASSWORD:?Use ephemeral test PostgreSQL credentials}"
: "${DATABASE_URL:?DATABASE_URL required}"
: "${GITHUB_STEP_SUMMARY:=/dev/null}"
if [[ "${NODE_ENV:-}" != "test" || "${RECOVERY_DRILL_ENABLED:-}" != "true" ||
      "$DATABASE_URL" != "postgresql://test:test@127.0.0.1:5432/triad_recovery_source" ]]; then
  echo "Refusing destructive recovery drill outside approved CI source" >&2
  exit 1
fi
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
chmod 700 "$temp_dir"
pg() {
  docker run --rm --network host --env PGPASSWORD \
    --volume "$temp_dir:/work" postgres:16-alpine "$@"
}
node scripts/recovery-drill.cjs seed
start_backup=$(date +%s)
pg pg_dump -h 127.0.0.1 -U test -d triad_recovery_source -Fc -f /work/backup.dump
end_backup=$(date +%s)
node scripts/recovery-drill.cjs post-backup
start_restore=$(date +%s)
pg createdb -h 127.0.0.1 -U test -T template0 triad_recovery_target
pg pg_restore -h 127.0.0.1 -U test -d triad_recovery_target \
  --no-owner --no-acl --exit-on-error /work/backup.dump
end_restore=$(date +%s)
export DATABASE_URL="postgresql://test:test@127.0.0.1:5432/triad_recovery_target"
node scripts/recovery-drill.cjs verify
start_rebuild=$(date +%s)
npm run projection:rebuild:orders
npm run projection:rebuild:products
node scripts/recovery-drill.cjs verify-projections
end_rebuild=$(date +%s)
cat >> "$GITHUB_STEP_SUMMARY" <<EOF
## I9 disposable PostgreSQL recovery drill
- Backup: $((end_backup - start_backup)) seconds
- Restore: $((end_restore - start_restore)) seconds
- Read-model rebuild and validation: $((end_rebuild - start_rebuild)) seconds
- Recovered user, stock, order/idempotency, outbox intent, and rebuilt projections
- Post-snapshot outbox write deliberately absent
- CI fixture measurements only; **not production RTO/RPO**
EOF
echo "I9 backup/restore/rebuild PASS"
