#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${RECOVERY_RUNTIME_ENABLED:-}" == "true" ]]
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]
prefix="triad-runtime-recovery-$GITHUB_RUN_ID"
network="$prefix-net"
pg="$prefix-pg"
redis="$prefix-redis"
smtp="$prefix-smtp"
api="$prefix-api"
rollback="$prefix-rollback"
image="triad-backend:runtime-recovery-$GITHUB_RUN_ID"
temporary="$(mktemp -d)"
cleanup() {
  for name in "$api" "$rollback" "$smtp" "$redis" "$pg"; do docker container rm --force --volumes "$name" >/dev/null 2>&1 || true; done
  docker network rm "$network" >/dev/null 2>&1 || true
  docker volume rm "$prefix-aof" >/dev/null 2>&1 || true
  node -e 'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true})' "$temporary"
}
trap cleanup EXIT
clock() { node -e 'console.log(Date.now())'; }
source_url="postgresql://test:test@$pg:5432/triad_recovery_source"
target_url="postgresql://test:test@$pg:5432/triad_recovery_target"
docker network create "$network" >/dev/null
docker volume create "$prefix-aof" >/dev/null
docker run -d --name "$pg" --network "$network" -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=triad_recovery_source postgres:18-alpine postgres -c track_commit_timestamp=on >/dev/null
docker run -d --name "$redis" --network "$network" --mount "source=$prefix-aof,target=/data" \
  redis:7-alpine redis-server --appendonly yes --appendfsync always --maxmemory-policy noeviction >/dev/null
docker build --target production --tag "$image" .
docker run -d --name "$smtp" --network "$network" -e RECOVERY_RUNTIME_ENABLED=true \
  --mount "type=bind,source=$PWD/scripts/acceptance,target=/app/scripts/acceptance,readonly" \
  --entrypoint node "$image" /app/scripts/acceptance/recovery-smtp.cjs >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$pg" pg_isready -U test >/dev/null 2>&1 && [[ "$(docker exec "$redis" redis-cli ping 2>/dev/null)" == "PONG" ]]; then break; fi
  sleep 1
done
docker run --rm --network "$network" -e "DATABASE_URL=$source_url" "$image" ./node_modules/.bin/prisma migrate deploy
fixture() {
  local database="$1" mode="$2" api_container="${3:-$api}"
  docker run --rm --network "$network" \
    -e RECOVERY_RUNTIME_ENABLED=true -e "RECOVERY_PREFIX=$prefix" \
    -e "DATABASE_URL=$database" -e "REDIS_URL=redis://$redis:6379" -e "RECOVERY_API_CONTAINER=$api_container" \
    --mount "type=bind,source=$PWD/scripts/acceptance,target=/app/scripts/acceptance,readonly" \
    --entrypoint node "$image" /app/scripts/acceptance/recovery-fixture.cjs "$mode"
}
fixture "$source_url" seed > "$temporary/snapshot-marker.json"
docker exec "$pg" pg_dump -U test -d triad_recovery_source -Fc > "$temporary/plain.dump"
# The archive and the separately copied escrow key are both ephemeral in CI.
node -e 'require("node:fs").writeFileSync(process.argv[1],require("node:crypto").randomBytes(32).toString("hex"),{mode:0o600})' "$temporary/source.key"
mkdir -m 700 "$temporary/escrow"
cp "$temporary/source.key" "$temporary/escrow/recovery.key"
node scripts/acceptance/recovery-archive.cjs encrypt "$temporary/plain.dump" "$temporary/backup.enc" "$temporary/source.key"
node -e 'require("node:fs").unlinkSync(process.argv[1])' "$temporary/plain.dump"
node -e 'require("node:fs").unlinkSync(process.argv[1])' "$temporary/source.key"
fixture "$source_url" post-backup > "$temporary/incident-marker.json"
incident="$(clock)"
node scripts/acceptance/recovery-archive.cjs decrypt "$temporary/backup.enc" "$temporary/restored.dump" "$temporary/escrow/recovery.key"
docker exec "$pg" createdb -U test -T template0 triad_recovery_target
docker exec -i "$pg" pg_restore -U test -d triad_recovery_target --no-owner --no-acl --exit-on-error < "$temporary/restored.dump"
# Real Redis process crash on an explicitly owned disposable container/volume.
docker kill --signal KILL "$redis" >/dev/null
docker start "$redis" >/dev/null
for attempt in $(seq 1 30); do
  if [[ "$(docker exec "$redis" redis-cli ping 2>/dev/null)" == "PONG" ]]; then break; fi
  sleep 1
done
fixture "$target_url" queue > "$temporary/queue.json"
fixture "$target_url" prepare > "$temporary/prepare.json"
start_api() {
  local name="$1" database="$2"
  docker run -d --init --name "$name" --network "$network" -p 127.0.0.1:18000:3000 \
    -e NODE_ENV=production -e PORT=3000 -e "DATABASE_URL=$database" -e "REDIS_URL=redis://$redis:6379" \
    -e API_EDGE_SECRET= -e TRUST_PROXY=0 -e ENABLE_TRACING=false \
    -e JWT_ACCESS_SECRET=disposable-runtime-recovery-access-at-least-32 \
    -e JWT_REFRESH_SECRET=disposable-runtime-recovery-refresh-at-least-32 \
    -e JWT_PREAUTH_SECRET=disposable-runtime-recovery-preauth-at-least-32 \
    -e TOTP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
    -e FRONTEND_URL=http://127.0.0.1:18000 -e CORS_ORIGIN=http://127.0.0.1:18000 \
    -e "SMTP_HOST=$smtp" -e SMTP_PORT=1025 -e SMTP_USER=fixture -e SMTP_PASS=fixture -e SMTP_FROM=recovery@example.invalid \
    -e CLOUDINARY_CLOUD_NAME=fixture -e CLOUDINARY_API_KEY=fixture -e CLOUDINARY_API_SECRET=fixture \
    "$image" >/dev/null
}
ready() {
  for attempt in $(seq 1 60); do
    if curl --fail --silent --max-time 3 http://127.0.0.1:18000/health/ready | jq -e '.status == "up" and .components.database.status == "up" and .components.cache.status == "up" and .components.queues.status == "up"' >/dev/null; then return 0; fi
    sleep 1
  done
  echo "Recovery API did not become ready" >&2; return 1
}
start_api "$api" "$target_url"
ready
fixture "$target_url" http > "$temporary/http.json"
processed=0
for attempt in $(seq 1 30); do
  if fixture "$target_url" verify > "$temporary/runtime.json" 2>/dev/null; then processed=1; break; fi
  sleep 1
done
[[ "$processed" == "1" ]]
recovered="$(clock)"
fixture "$source_url" source > "$temporary/source.json"
# Drain the recovered runtime before a reversible isolated rollback rehearsal.
docker stop --time 15 "$api" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$api")" == "0" ]]
start_api "$rollback" "$source_url"
ready
fixture "$target_url" http "$rollback" > "$temporary/rollback-http.json"
fixture "$source_url" source >/dev/null
docker stop --time 15 "$rollback" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$rollback")" == "0" ]]
docker start "$api" >/dev/null
ready
fixture "$target_url" http >/dev/null
fixture "$target_url" verify > "$temporary/restart.json"
docker stop --time 15 "$api" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$api")" == "0" ]]
node - "$temporary" "$incident" "$recovered" "$(git rev-parse HEAD)" <<'NODE'
const fs = require('node:fs');
const [dir, incident, recovered, sha] = process.argv.slice(2);
const read = name => JSON.parse(fs.readFileSync(dir + '/' + name + '.json'));
const latestRecoveredCommit = read('snapshot-marker').committedAt;
const lastSourceCommit = read('incident-marker').committedAt;
const gap = Date.parse(lastSourceCommit) - Date.parse(latestRecoveredCommit);
if (!Number.isFinite(gap) || gap < 0) throw new Error('Invalid committed-marker gap');
const evidence = {
  result: 'PASS', sha, environment: 'disposable-ci-production-runtime',
  postgres: '18, fixture-only track_commit_timestamp=on',
  redis: '7, AOF appendfsync=always, noeviction; SIGKILL restart',
  archive: 'AES-256-GCM authenticated roundtrip; separate ephemeral escrow key',
  incidentAt: new Date(Number(incident)).toISOString(),
  authenticatedWorkerReadyAt: new Date(Number(recovered)).toISOString(),
  observedRecoveryMs: Number(recovered) - Number(incident),
  lastSourceCommit, latestRecoveredCommit, observedFixtureRpoMs: gap,
  ...read('queue'), ...read('prepare'), ...read('http'), ...read('runtime'),
  rollbackAuthenticatedApi: read('rollback-http').authenticatedApi,
  restartDoesNotRepeatEffects: read('restart').capturedMessages === 2,
  productionObjectivesApproved: false,
  exclusions: ['hosted restore/cutover', 'off-host retention', 'real key escrow', 'production RTO/RPO', 'Brevo or Cloudinary delivery'],
};
fs.writeFileSync('recovery-runtime-evidence.json', JSON.stringify(evidence, null, 2));
console.log('PASS full-runtime recovery ' + JSON.stringify(evidence));
NODE
