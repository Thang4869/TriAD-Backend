#!/usr/bin/env bash
set -euo pipefail

# Never tear down an operator's project, volume, or external database.
[[ "${COMPOSE_ACCEPTANCE_ENABLED:-}" == "true" ]]
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^triad-acceptance-[0-9]+$ ]]
[[ "${DATABASE_URL:-}" == "postgresql://acceptance:acceptance@postgres:5432/triad_compose_acceptance" ]]
[[ "${REDIS_URL:-}" == "redis://redis:6379" ]]
[[ "${TRIAD_API_BIND:-}" == "127.0.0.1" ]]
[[ "${TRIAD_API_PORT:-}" =~ ^[0-9]+$ ]]
[[ -z "${API_EDGE_SECRET:-}" ]]

compose=(docker compose -f docker-compose.prod.yml -f ops/compose.acceptance.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" build api
"${compose[@]}" up -d
base="http://127.0.0.1:$TRIAD_API_PORT"
ready=0
for attempt in $(seq 1 90); do
  if curl --silent --fail --max-time 3 "$base/health/ready" | jq -e '
    .status == "up" and .components.database.status == "up" and
    .components.cache.status == "up" and .components.queues.status == "up"
  ' >/dev/null; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == "1" ]]
curl --silent --fail --max-time 5 "$base/health/live" >/dev/null
curl --silent --fail --max-time 5 "$base/api/products" | jq -e '.success == true' >/dev/null
for path in /metrics /api/docs; do
  [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$base$path")" == "404" ]]
done
migration="$("${compose[@]}" ps --all --quiet migrate)"
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$migration")" == "0" ]]
collector="$("${compose[@]}" ps --quiet otel-collector)"
[[ "$(docker inspect --format '{{.State.Running}}' "$collector")" == "true" ]]
api="$("${compose[@]}" ps --quiet api)"
"${compose[@]}" stop -t 15 api
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$api")" == "0" ]]
docker logs "$api" 2>&1 | grep 'Graceful shutdown completed' >/dev/null
jq -n --arg sha "$(git rev-parse HEAD)" '{
  sha: $sha, environment: "disposable-ci-production-compose",
  compose_config: "PASS", migration: "PASS", collector_running: "PASS",
  readiness_database_cache_queues: "PASS", catalog: "PASS",
  protected_routes: "PASS", sigterm_exit_zero: "PASS"
}' > production-compose-evidence.json
echo 'PASS: production Compose config, migrations, ready/API, protected routes and SIGTERM'
