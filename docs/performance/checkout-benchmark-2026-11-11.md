# Checkout Performance Benchmark — 2026-11-11

## 1. Summary

Two local k6 benchmark workloads were executed against an isolated PostgreSQL and Redis environment:

- Checkout baseline: 5 VUs, 2 minutes.
- Hot-product contention: 5 VUs, 2 minutes.

The hot-product workload passed all configured thresholds. The baseline workload failed the p99 latency threshold. The overall result is **PARTIAL PASS**, not a full performance pass.

These results describe this local environment only. They are not production capacity measurements.

## 2. Environment

| Component | Configuration |
|---|---|
| Repository | TriAD Backend |
| Git branch | main |
| Benchmark date | 2026-11-11 |
| Node.js | v24.14.0 |
| k6 | v2.3.0 |
| Docker Desktop | 4.87.0 |
| Docker Engine | 29.7.2 |
| PostgreSQL | `triad-perf-postgres`, host port 5544 |
| Redis | `triad-perf-redis`, host port 6381 |
| API | `http://127.0.0.1:5001` |
| Database | `triad_perf` |
| Benchmark run ID | `local-20261111` |
| Virtual users | 5 |
| Duration per workload | 2 minutes |

The API reported a Prisma connection pool of 13 connections.

Container resource snapshots after the benchmark:

| Container | CPU | Memory |
|---|---:|---:|
| PostgreSQL | 41.99% | 168.9 MiB |
| Redis | 1.13% | 80.11 MiB |

These are point-in-time Docker statistics, not averages over the benchmark duration.

## 3. Acceptance thresholds

| Metric | Threshold |
|---|---:|
| Checkout p95 | < 1,500 ms |
| Checkout p99 | < 3,000 ms |
| Checkout failure rate | < 1% |

The thresholds were kept unchanged for both workloads.

## 4. Baseline results

| Metric | Result |
|---|---:|
| Virtual users | 5 |
| Duration | 2 minutes |
| Completed iterations | 3,371 |
| Successful checkouts | 3,348 |
| Failed checkouts | 23 |
| Checkout success rate | 99.32% |
| Checkout failure rate | 0.68% |
| Successful checkouts/sec | 27.19 |
| Checkout duration average | 151.04 ms |
| Checkout duration median (p50) | 53.76 ms |
| Checkout duration p90 | 197.34 ms |
| Checkout duration p95 | 483.66 ms |
| Checkout duration p99 | 3,430 ms |
| Checkout duration maximum | 3,740 ms |
| Final HTTP 409 conflicts | 23 |
| Transaction conflicts | 841 |
| Transaction retries | 818 |
| Cart-add failures | 0 |

Threshold evaluation:

- p95: PASS
- p99: FAIL
- Failure rate: PASS

**Baseline result: FAIL** because p99 exceeded 3,000 ms.

## 5. Hot-product contention results

| Metric | Result |
|---|---:|
| Virtual users | 5 |
| Duration | 2 minutes |
| Completed iterations | 6,384 |
| Successful checkouts | 6,357 |
| Failed checkouts | 27 |
| Checkout success rate | 99.58% |
| Checkout failure rate | 0.42% |
| Successful checkouts/sec | 51.54 |
| Checkout duration average | 64.66 ms |
| Checkout duration median (p50) | 25.13 ms |
| Checkout duration p90 | 61.88 ms |
| Checkout duration p95 | 71.52 ms |
| Checkout duration p99 | 903.24 ms |
| Checkout duration maximum | 3,640 ms |
| Final HTTP 409 conflicts | 27 |
| Transaction conflicts | 430 |
| Transaction retries | 403 |
| Cart-add failures | 0 |

Threshold evaluation:

- p95: PASS
- p99: PASS
- Failure rate: PASS

**Hot-product result: PASS** against all configured thresholds.

## 6. Comparison

| Metric | Baseline | Hot-product |
|---|---:|---:|
| Completed iterations | 3,371 | 6,384 |
| Successful checkouts/sec | 27.19 | 51.54 |
| Checkout failure rate | 0.68% | 0.42% |
| p50 | 53.76 ms | 25.13 ms |
| p95 | 483.66 ms | 71.52 ms |
| p99 | 3,430 ms | 903.24 ms |
| Transaction conflicts | 841 | 430 |
| Transaction retries | 818 | 403 |
| Final HTTP 409 | 23 | 27 |

The two workloads exercise different checkout patterns. Their results should not be interpreted as a controlled before-and-after comparison or proof that one workload is inherently faster.

Both workloads experienced transaction conflicts and retries. The retry mechanism handled many conflicts, but some requests still ended in HTTP 409. The baseline p99 threshold failure remains unresolved.

## 7. Implementation context

The checkout transaction uses serializable isolation and product row locking. Product stock updates also use an optimistic version condition.

The checkout service retries transaction conflicts up to five times, using exponential backoff with jitter. The configured base delay is 100 ms.

This retry strategy helps recover from transient conflicts but can contribute to long-tail latency when repeated retries occur. The baseline p99 result warrants further investigation; this benchmark alone does not establish the root cause.

## 8. Benchmark execution caveat

Both k6 runs emitted this warning:

`"env" level configuration overrode scenarios configuration entirely`

The effective run still used 5 VUs for 2 minutes, as confirmed by the execution summary. However, the scenario was reported as `default` rather than the configured scenario name.

The benchmark should be repeated after reviewing the k6 environment option names and avoiding collisions with built-in k6 options. The warning is recorded here rather than silently disregarded.

## 9. Raw artifacts

The raw k6 JSON output files were retained in the Windows temporary directory and were not added to Git:

- `%TEMP%\triad-checkout-baseline-20261111.json` (23,468,628 bytes)
- `%TEMP%\triad-checkout-contention-20261111.json` (44,382,651 bytes)

Run ID: `local-20261111`

## 10. Conclusion and follow-up

**Overall status: PARTIAL PASS**

- Hot-product contention meets all configured latency and failure-rate thresholds.
- Baseline meets p95 and failure-rate thresholds but fails p99.
- Residual HTTP 409 checkout failures remain in both workloads.
- The k6 environment/scenario warning should be resolved before treating the benchmark as fully reproducible.

Recommended follow-up:

1. Resolve the k6 environment option collision and repeat both workloads.
2. Investigate baseline p99 tail latency and residual HTTP 409 responses.
3. Repeat under controlled conditions before making capacity or production-readiness claims.

No production load test was performed.