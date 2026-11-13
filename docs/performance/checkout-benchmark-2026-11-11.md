# Checkout Performance Benchmark — 2026-11-11

## 1. Summary

Two local k6 benchmark workloads were executed against an isolated PostgreSQL and Redis environment:

- Checkout baseline: 5 VUs, 2 minutes.
- Hot-product contention: 5 VUs, 2 minutes.

The hot-product workload passed all configured thresholds. The baseline workload failed the p99 latency threshold. The overall result is **PARTIAL PASS**, not a full performance pass.

These results describe this local environment only. They are not production capacity measurements.

## 2. Environment

| Component             | Configuration                         |
| --------------------- | ------------------------------------- |
| Repository            | TriAD Backend                         |
| Git branch            | main                                  |
| Benchmark date        | 2026-11-11                            |
| Node.js               | v24.14.0                              |
| k6                    | v2.3.0                                |
| Docker Desktop        | 4.87.0                                |
| Docker Engine         | 29.7.2                                |
| PostgreSQL            | `triad-perf-postgres`, host port 5544 |
| Redis                 | `triad-perf-redis`, host port 6381    |
| API                   | `http://127.0.0.1:5001`               |
| Database              | `triad_perf`                          |
| Benchmark run ID      | `local-20261111`                      |
| Virtual users         | 5                                     |
| Duration per workload | 2 minutes                             |

The API reported a Prisma connection pool of 13 connections.

Container resource snapshots after the benchmark:

| Container  |    CPU |    Memory |
| ---------- | -----: | --------: |
| PostgreSQL | 41.99% | 168.9 MiB |
| Redis      |  1.13% | 80.11 MiB |

These are point-in-time Docker statistics, not averages over the benchmark duration.

## 3. Acceptance thresholds

| Metric                |  Threshold |
| --------------------- | ---------: |
| Checkout p95          | < 1,500 ms |
| Checkout p99          | < 3,000 ms |
| Checkout failure rate |       < 1% |

The thresholds were kept unchanged for both workloads.

## 4. Baseline results

| Metric                         |    Result |
| ------------------------------ | --------: |
| Virtual users                  |         5 |
| Duration                       | 2 minutes |
| Completed iterations           |     3,371 |
| Successful checkouts           |     3,348 |
| Failed checkouts               |        23 |
| Checkout success rate          |    99.32% |
| Checkout failure rate          |     0.68% |
| Successful checkouts/sec       |     27.19 |
| Checkout duration average      | 151.04 ms |
| Checkout duration median (p50) |  53.76 ms |
| Checkout duration p90          | 197.34 ms |
| Checkout duration p95          | 483.66 ms |
| Checkout duration p99          |  3,430 ms |
| Checkout duration maximum      |  3,740 ms |
| Final HTTP 409 conflicts       |        23 |
| Transaction conflicts          |       841 |
| Transaction retries            |       818 |
| Cart-add failures              |         0 |

Threshold evaluation:

- p95: PASS
- p99: FAIL
- Failure rate: PASS

**Baseline result: FAIL** because p99 exceeded 3,000 ms.

## 5. Hot-product contention results

| Metric                         |    Result |
| ------------------------------ | --------: |
| Virtual users                  |         5 |
| Duration                       | 2 minutes |
| Completed iterations           |     6,384 |
| Successful checkouts           |     6,357 |
| Failed checkouts               |        27 |
| Checkout success rate          |    99.58% |
| Checkout failure rate          |     0.42% |
| Successful checkouts/sec       |     51.54 |
| Checkout duration average      |  64.66 ms |
| Checkout duration median (p50) |  25.13 ms |
| Checkout duration p90          |  61.88 ms |
| Checkout duration p95          |  71.52 ms |
| Checkout duration p99          | 903.24 ms |
| Checkout duration maximum      |  3,640 ms |
| Final HTTP 409 conflicts       |        27 |
| Transaction conflicts          |       430 |
| Transaction retries            |       403 |
| Cart-add failures              |         0 |

Threshold evaluation:

- p95: PASS
- p99: PASS
- Failure rate: PASS

**Hot-product result: PASS** against all configured thresholds.

## 6. Comparison

| Metric                   |  Baseline | Hot-product |
| ------------------------ | --------: | ----------: |
| Completed iterations     |     3,371 |       6,384 |
| Successful checkouts/sec |     27.19 |       51.54 |
| Checkout failure rate    |     0.68% |       0.42% |
| p50                      |  53.76 ms |    25.13 ms |
| p95                      | 483.66 ms |    71.52 ms |
| p99                      |  3,430 ms |   903.24 ms |
| Transaction conflicts    |       841 |         430 |
| Transaction retries      |       818 |         403 |
| Final HTTP 409           |        23 |          27 |

The two workloads exercise different checkout patterns. Their results should not be interpreted as a controlled before-and-after comparison or proof that one workload is inherently faster.

Both workloads experienced transaction conflicts and retries. The retry mechanism handled many conflicts, but some requests still ended in HTTP 409. The baseline p99 threshold failure remains unresolved.

## 7. Implementation context

The checkout transaction uses serializable isolation and product row locking. Product stock updates also use an optimistic version condition.

The checkout service retries transaction conflicts up to five times, using exponential backoff with jitter. The configured base delay is 100 ms.

This retry strategy helps recover from transient conflicts but can contribute to long-tail latency when repeated retries occur. The baseline p99 result warrants further investigation; this benchmark alone does not establish the root cause.

## 8. Benchmark execution caveat and isolation findings

Both k6 runs emitted this warning:

`"env" level configuration overrode scenarios configuration entirely`

The effective run still used 5 VUs for 2 minutes, as confirmed by the execution summary. However, the scenario was reported as `default` rather than the configured scenario name. The benchmark configuration used custom k6-prefixed environment names, which overlap with k6's own configuration namespace and can override the `scenarios` configuration.

The original checkout key was composed only from run ID, VU and iteration. Because `__ITER` starts again when another scenario starts, baseline and contention could generate the same key and receive a replayed idempotency response. This is a risk identified from the implementation, not evidence that any specific response in this run was replayed.

The 23 baseline and 27 hot-product HTTP 409 responses are observed benchmark results. The report does not attribute those 409 responses to idempotency replay without response-level evidence; transaction conflicts and retries were also observed.

The scripts are being corrected to use the `TRIAD_PERF_*` namespace and scenario-qualified keys (`runId-scenarioName-VU-iteration`). No post-fix benchmark has been run yet, so the results in this report remain the original 2026-11-11 measurements.

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

1. Complete the namespace and scenario-key isolation fix, then repeat both workloads.
2. Investigate baseline p99 tail latency and residual HTTP 409 responses.
3. Repeat under controlled conditions before making capacity or production-readiness claims.

No production load test was performed.

## 11. Post-fix verification – Issue #144

The isolation fix was verified locally on 2026-11-12 against commit `df45cb9637418ca9f3e82c19cfaec28ff9418a44`. The benchmark used the existing dedicated local containers without recreating or deleting them:

| Component              | Configuration                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| k6                     | v2.3.0                                                           |
| Node.js                | v24.14.0                                                         |
| API                    | local compiled server on `http://127.0.0.1:5001`                 |
| PostgreSQL             | `triad-perf-postgres`, `postgres:16-alpine`, host port 5544      |
| Redis                  | `triad-perf-redis`, `redis:7-alpine`, host port 6381, database 0 |
| Database               | `triad_perf`                                                     |
| PostgreSQL/Redis state | Dedicated benchmark containers; no data or keys were deleted     |

The API readiness endpoint and metrics endpoint both returned HTTP 200. The API startup log confirmed the benchmark database URL, Redis URL and port 5001. The fixture seeder created additive, run-specific users and products using the existing `TRIAD_PERF_*` safety checks.

### 11.1 Baseline

- Run ID: `postfix-baseline-20261112-0349`
- Scenario: `checkout_baseline`
- VUs: 5
- Duration: 2 minutes
- Completed iterations: 1,013
- Successful checkouts: 991
- Failed checkouts: 22
- HTTP status: 991 HTTP 201, 22 HTTP 409
- Cart-add failures: 0
- p50: 204.65 ms
- p95: 2.21 s
- p99: 4.13 s
- Successful checkout throughput: 7.837786/s
- Transaction conflicts: 634
- Transaction retries: 612

Threshold result: **FAIL**. p95, p99 and failure-rate thresholds were crossed. The 22 failed checkout responses were observed as `APPLICATION.CONFLICT` / transaction-conflict responses; this run provides no evidence that they were idempotency replays.

### 11.2 Hot-product contention

- Run ID: `postfix-contention-20261112-0349`
- Scenario: `hot_product_contention`
- VUs: 10
- Duration: 2 minutes
- Completed iterations: 1,341
- Successful checkouts: 1,212
- Failed checkouts: 129
- HTTP status: 1,212 HTTP 201, 129 HTTP 409
- Cart-add failures: 0
- p50: 207.16 ms
- p95: 3.91 s
- p99: 4.35 s
- Successful checkout throughput: 9.536294/s
- Transaction conflicts: 1,480
- Transaction retries: 1,351

Threshold result: **FAIL**. p95 and failure-rate thresholds were crossed; p99 passed. The 129 failed checkout responses were observed as transaction-conflict responses, not proven idempotency replays.

### 11.3 Isolation evidence and comparison

Both k6 runs reported their configured scenario names and did not emit the previous `env`/`scenarios` override warning. The generated checkout keys included the run ID, scenario name, VU and iteration:

- Baseline: 991 persisted orders with 991 distinct `checkout_baseline` keys.
- Contention: 1,212 persisted orders with 1,212 distinct `hot_product_contention` keys.
- No order used the old unqualified key shape in the checked run IDs.
- Redis contained 991 baseline-scenario idempotency keys and 1,212 contention-scenario keys after the runs. The dedicated Redis database contained pre-existing keys; none were deleted.

Compared with the 2026-11-11 measurements, the new runs are not a controlled performance comparison: the contention workload used 10 VUs instead of the earlier report's 5 VUs, and the fixture/run IDs and accumulated local container state differed. The new evidence verifies scenario and idempotency isolation, but both workloads failed the configured performance thresholds. The run is therefore **PARTIALLY VERIFIED**, not benchmark-accepted.

Raw post-fix artifacts were retained outside Git:

- `%TEMP%\triad-checkout-baseline-postfix-20261112.json`
- `%TEMP%\triad-checkout-contention-postfix-20261112.json`
- `%TEMP%\triad-checkout-baseline-postfix-20261112.log`
- `%TEMP%\triad-checkout-contention-postfix-20261112.log`

## 12. Checkout concurrency/retry fix verification — 2026-11-14

The residual 409s were caused by `SERIALIZABLE` transaction aborts under
contention, not by exhausted inventory. Checkout already locks product rows
with `FOR UPDATE`, checks the product version on the stock update, and applies
discount usage conditionally. The checkout unit of work now defaults to
`READ COMMITTED`, retaining those explicit row/conditional-write invariants
while avoiding avoidable serialization aborts. Serializable mode remains
available to the contention regression test, and genuinely reported database
conflicts remain bounded and retryable.

The verification used the existing dedicated `triad-perf-postgres` and
`triad-perf-redis` containers, an isolated API on port 5001, additive
run-specific fixtures, 10 VUs and 2 minutes per workload. The benchmark email
worker was disabled. No containers, queues, rows or Redis keys were deleted.

| Workload               | Iterations | Failures | Failure rate |       p95 |       p99 | Conflicts | Retries |
| ---------------------- | ---------: | -------: | -----------: | --------: | --------: | --------: | ------: |
| Baseline               |      6,943 |        0 |        0.00% | 186.50 ms | 281.03 ms |         0 |       0 |
| Hot-product contention |      3,796 |        0 |        0.00% | 467.09 ms | 651.57 ms |         0 |       0 |

Both workloads passed their configured latency and failure-rate thresholds.
The benchmark acceptance target of a failure rate below 1% was met, with no
observed transaction retries or final HTTP 409 responses. The raw k6 JSON
outputs remain outside Git:

- `%TEMP%\triad-reliability-baseline-20261114.json`
- `%TEMP%\triad-reliability-contention-20261114.json`

This is a local verification result, not a production capacity claim.
