# Idempotency recovery and lease ownership

**Scope:** HTTP idempotency middleware, checkout retry safety and Redis availability.
**Verification (2026-10-18):** Implementation and unit/integration tests are on `main`; the current CI run [#39116584480](https://github.com/Thang4869/TriAD-Backend/actions/runs/39116584480) reports unit/integration and typecheck jobs passed at the time of review. Deployed failure drills remain **OPEN**; no staging outcome is claimed.

## Runtime contract

- Unsafe methods require a validated Idempotency-Key. The key is scoped to user and route and compared against a body digest.
- The first caller atomically claims a short-lived Redis entry with a unique owner ID (NX/EX).
- While the handler executes, an owner-checked Lua command extends the in-progress TTL. The renewal timer stops on response finish/close, ownership loss or Redis error.
- A successful response is stored only if the exact owner claim still exists. Failed responses remove the claim only if the original owner still holds it.
- A second caller with the same key and body receives a conflict while the first is pending, or a replay after completion. A different body receives a validation conflict.
- Redis read/claim outages return a dependency-unavailable error rather than permitting unprotected execution.

## Critical limitation

**An expiring Redis lease is not a distributed business-transaction lock.** After Redis outage, TTL expiry, or process crash, an old request may still execute database writes even if it can no longer update the cached response. Redis owner checks protect the *cache entry*, not PostgreSQL domain mutations.

Therefore checkout/order creation must enforce idempotency at the durable transaction/database boundary as well. Do not claim exactly-once checkout solely from this HTTP middleware.

## Acceptance evidence for issue #84

1. Run unit, integration (real Redis), typecheck and lint on the branch; publish links to CI executions.
2. During a long-running test, verify that heartbeat renews only the current owner and stops on connection loss, response completion and process termination.
3. Advance the TTL and simulate delayed completion from owner A after owner B has taken the key. Verify owner A cannot overwrite or delete B's cache entry.
4. Kill the API worker after a durable checkout commit but before HTTP delivery. Retry with the same key and verify the durable checkout transaction does not create a duplicate order.
5. Disconnect Redis before claim acquisition: requests fail closed with HTTP 503. Recover Redis and verify subsequent requests succeed without a restart.
6. Confirm captured logs contain no full raw idempotency key, access token or sensitive request body. Record exceptions and an operations runbook.

### Required evidence record for a staging run

| Date (UTC) | Deployment SHA | Scenario | Expected/observed result | Order count before/after retry | Sanitized artifact link |
| --- | --- | --- | --- | --- | --- |
| Pending staging execution | — | Redis outage / lost response / stale lease | — | — | No deployed result claimed |

Use synthetic accounts and orders. Record incident and recovery timestamps, HTTP status, Redis availability, and durable order identifiers in redacted form. Never attach raw idempotency keys, access tokens, request bodies or customer data.

**Do not close #84** until durable recovery proof and CI checks are available.
