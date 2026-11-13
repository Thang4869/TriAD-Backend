# Checkout load and contention benchmarks

These k6 scenarios are for a **disposable local PostgreSQL/Redis environment**. They do not target staging or production by default. The seed command refuses to run unless the database is named `triad_perf`, the explicit confirmation variable is set, and `NODE_ENV` is not production.

## What is measured

- `checkout-baseline.js`: each virtual user (VU) checks out an independent SKU.
- `hot-product-contention.js`: all VUs check out the same SKU, exercising the product row lock and bounded transaction conflict handling/retry.
- k6 reports checkout duration p50/p95/p99, checkout throughput (successful checkouts/second), successful checkouts, HTTP failures and HTTP 409 conflicts.
- The backend exposes Prometheus counters for transaction conflicts and retries. Each run prints the before/after delta as `CHECKOUT_CONTENTION_METRICS`.

The cart-add request is setup for each iteration and is tagged separately; `checkout_duration` measures only the checkout request. Each VU has its own account and unique idempotency key per scenario, VU and iteration.

## 1. Start isolated dependencies

Run from the backend repository in PowerShell. These containers use dedicated loopback ports and do not reuse or modify the project's normal `triad-postgres` / `triad-redis` containers.

```powershell
docker run --name triad-perf-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=triad_perf -p 127.0.0.1:5544:5432 -d postgres:16-alpine
docker run --name triad-perf-redis -p 127.0.0.1:6381:6379 -d redis:7-alpine
```

Wait until PostgreSQL and Redis are healthy. Keep these services local and disposable.

## 2. Configure this PowerShell session

Use a benchmark-only password of at least 12 characters. Do not commit it, put it in a report, or reuse a real account password.

```powershell
$env:NODE_ENV = 'development'
$env:PORT = '5001'
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5544/triad_perf?schema=public'
$env:REDIS_URL = 'redis://127.0.0.1:6381'
$env:QUEUE_REDIS_URL = 'redis://127.0.0.1:6381'
$env:RATE_LIMIT_MAX = '10000'
$env:TRIAD_PERF_CONFIRM = 'I_UNDERSTAND_LOCAL_BENCHMARK_DATA'
$env:TRIAD_PERF_RUN_ID = 'local-20261110'
$env:TRIAD_PERF_USERS = '10'
$env:TRIAD_PERF_PASSWORD = 'replace-with-a-local-only-password'
```

The backend still loads the repository's normal `.env` for unrelated required configuration. The process environment values above override its database, Redis and port settings. Do not use `npm run dev`: that script kills port 5000. Start a separate process on port 5001 instead.

## 3. Migrate and seed fixtures

```powershell
npx prisma migrate deploy
npm run --silent perf:checkout:seed | Tee-Object -FilePath "$env:TEMP\triad-perf-fixtures.json"
```

The seeder creates verified benchmark-only users, one independent product per user, and one shared hot product. It does not delete existing rows or reset stock. Use a new run ID or a fresh disposable database for a clean run.

## 4. Start the isolated API

In a second PowerShell terminal, set the same `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `QUEUE_REDIS_URL` and `RATE_LIMIT_MAX` values, then run:

```powershell
npx ts-node -r tsconfig-paths/register src/server.ts
```

Wait for the API to report database and Redis readiness. Confirm `http://127.0.0.1:5001/health/ready` and `http://127.0.0.1:5001/metrics` respond successfully.

## 5. Run k6

Install k6 locally from the official Grafana k6 distribution; it is intentionally not an application dependency. In the benchmark terminal:

```powershell
$fixtures = Get-Content -LiteralPath "$env:TEMP\triad-perf-fixtures.json" -Raw | ConvertFrom-Json
$env:TRIAD_PERF_BASE_URL = 'http://127.0.0.1:5001'
$env:TRIAD_PERF_RUN_ID = $fixtures.runId
$env:TRIAD_PERF_BENCH_EMAILS = ConvertTo-Json -Compress -InputObject @($fixtures.emails)
$env:TRIAD_PERF_PRODUCT_IDS = ConvertTo-Json -Compress -InputObject @($fixtures.productIds)
$env:TRIAD_PERF_HOT_PRODUCT_ID = $fixtures.hotProductId
$env:TRIAD_PERF_BENCH_PASSWORD = $env:TRIAD_PERF_PASSWORD
$env:TRIAD_PERF_VUS = '5'
$env:TRIAD_PERF_DURATION = '2m'

npm run perf:checkout:baseline
$env:TRIAD_PERF_VUS = '10'
npm run perf:checkout:contention
```

`TRIAD_PERF_VUS` must not exceed the seeded user count. The default target is loopback only. A remote host is rejected unless `TRIAD_PERF_ALLOW_REMOTE=true` is explicitly supplied; do not set it for production. Never include passwords, cookies, bearer tokens or raw environment dumps in benchmark artifacts.

Thresholds are intentionally configurable for different local hardware:

- `TRIAD_PERF_P95_MS` (default baseline 1500 ms; contention 2500 ms)
- `TRIAD_PERF_P99_MS` (default baseline 3000 ms; contention 5000 ms)
- `TRIAD_PERF_ERROR_RATE` (default 0.01)

Run each workload separately with a new run ID or disposable fixture database:

```powershell
npm run perf:checkout:baseline
npm run perf:checkout:contention
```

The scripts use the official k6 `scenarios` configuration. Benchmark settings intentionally use the `TRIAD_PERF_*` namespace so they cannot override k6 scenario options. The baseline uses the `checkout_baseline` scenario name and the contention workload uses `hot_product_contention`. Checkout idempotency keys are formed as `runId-scenarioName-VU-iteration`; the scenario name is required, so restarting `__ITER` in another workload cannot replay the previous workload's key.

## 6. Record reproducible evidence

For each run, record:

- Git commit SHA, Node.js version, k6 version and Docker image tags.
- CPU/RAM and Docker resource limits for the API, PostgreSQL and Redis.
- PostgreSQL connection settings, VU count, duration, run ID and scenario.
- p50/p95/p99 checkout latency, throughput, successful checkout count, HTTP error rate, HTTP 409 count, checkout ConflictError delta and retry delta.
- Whether thresholds passed, plus any warm-up or environmental anomalies.
- HTTP 409 responses, transaction conflict deltas and retry deltas; these are observations, not proof of an idempotency replay cause.

Save k6's JSON output with `--out json=<path>` only in a local ignored directory (for example `reports/performance/`). Review the file before sharing it. Do not commit tokens, passwords, customer data or environment dumps.

## Safety and interpretation

- The scripts reject non-loopback HTTP URLs. Remote targets require an explicit opt-in and a separately approved test window.
- Do not run these scenarios against staging or production without owner approval, a defined traffic ceiling and a rollback/stop plan.
- The shared-SKU scenario uses ample stock to isolate row-lock and transaction contention; it is not a stock-exhaustion test.
- Compare runs only when hardware, container limits, dataset, software commit and VU profile are comparable.
- The first run is a baseline, not a universal performance SLO. Calibrate thresholds from repeated runs on the same environment before treating them as regression gates.
- Fixtures are additive and the seeder intentionally performs no cleanup. Destroy only the dedicated disposable benchmark database/containers when finished.
