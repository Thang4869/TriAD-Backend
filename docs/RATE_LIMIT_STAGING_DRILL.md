# Rate limiting — B7 staging verification

**Status:** Source-level and real-Redis CI regression tests added in candidate PR (2026-10-23); deployed proxy/IP and Redis-outage evidence still pending. Do not close #140 on CI alone.

## Current code/CI protection and remaining staging gate

Code-level protection is implemented in
`src/shared/middlewares/rate-limit.middleware.ts`:

- `/api` global IP budget: `ratelimit:global:`; additional IP-wide
  authentication, 2FA and refresh budgets prevent rotating account identifiers
  to bypass throttling. Login and 2FA also use per-IP plus HMAC-derived
  email/pre-auth buckets. HMAC keys never expose raw credentials or email.
- The client address comes from Express `req.ip`, not directly from
  `X-Forwarded-For`. `TRUST_PROXY=0` ignores client-supplied proxy headers.
  Only set trusted hops/IP networks after verifying ingress and direct-access
  protections; an unverified `TRUST_PROXY=1` is not safe on a publicly
  reachable direct backend.
- Redis rate-limit **request commands** fail closed: HTTP **503** during
  outage/timeout and HTTP **429** for exceeded budgets. HTTP Redis commands
  have a 1000ms timeout. Startup Lua `SCRIPT LOAD` is intentionally exempt:
  `rate-limit-redis` v4 initializes and awaits Lua SHA promises asynchronously,
  so rejecting those during a cold Redis connection produced unhandled
  rejections and a failed Render deploy (`dep-dbdoet6q1p3s739ahskg`).
  The startup exception is not an HTTP fail-open bypass; the API is not ready
  until Redis and its initialization have succeeded. The prior deployment
  remained live during the failed update. Review a compatible v5+ store
  upgrade separately before revisiting bounded bootstrap.
- Safe Prometheus metrics:
  `triad_backend_rate_limit_decisions_total{bucket,outcome}`
  and `triad_backend_rate_limit_store_failures_total{operation,reason}`.
  Labels are a finite, code-defined set; never emit raw IP, email, token,
  Redis key, forwarded chain or a user-selected prefix. The metrics route
  remains protected/disabled for the public production API.
- `/health/live` and `/health/ready` are mounted outside the
  `/api` limiter. Readiness may still reflect Redis/cache health.

Focused regression commands (require disposable local Redis for integration):

```powershell
Set-Location E:\DNEK
npm run typecheck
npm run lint
npx vitest run tests/unit/config/trust-proxy.test.ts tests/unit/shared/middlewares/rate-limit.middleware.test.ts tests/unit/shared/middlewares/rate-limit.http.test.ts
npx vitest run tests/integration/rate-limit.redis.test.ts tests/integration/rate-limit.proxy.test.ts
```

The new **real Redis + supertest** integration suite covers direct spoofed
forwarded headers with `TRUST_PROXY=0`, IP allowlist mismatches, nearest
untrusted hops / distinct client budgets under a deliberately trusted test
proxy, 429 response headers, and liveness outside the API limiter.
This is deliberately *not* a deployment proxy drill.

**Still required to close #140:** independently establish actual Render
ingress hop/IP behavior and whether `/api` is directly reachable in addition
to the Vercel rewrite; verify it without leaking test client identities.
Rehearse Redis outage/reconnect on an **isolated, disposable** stack, not by
shutting down the shared Render staging Key Value service. Record 429/503
observations, health/readiness, recovery timestamps, sanitized metrics and
shared-NAT fairness. Keep `TRUST_PROXY=0` until a reviewed, verified trust
boundary is available. An isolated CI Redis disconnect test is not evidence
for Render ingress behavior.

## Preconditions
- Dedicated staging stack with a known reverse-proxy topology, isolated Redis, no production accounts or data.
- Record the deployment SHA, proxy addresses, `TRUST_PROXY`, rate-limit settings, Redis version, test client IPs and timestamps.
- Use two test identities behind a shared NAT and one independent source IP. Redact credentials and tokens from captured logs.

## Test cases and evidence
1. **429 budget:** Send more than the configured per-IP global requests within the window. Record status, RateLimit headers, rate-limit key category (not the raw identity), window and response body.
2. **Auth buckets:** Rotate test email identities from the same source IP. Confirm the shared IP budget cannot be bypassed and the per-identity budget is independent. Check two users behind shared NAT for accidental lockout; document any unavoidable trade-off.
3. **Header spoofing:** Send conflicting `X-Forwarded-For` values via the actual reverse proxy and directly to any accidentally exposed API endpoint. The derived client IP must follow only the configured trusted hops. Direct client headers must not allow rate-limit bypass.
4. **Redis disconnect:** Disable the test Redis connection while issuing API calls. Verify failed rate-limit store access denies requests instead of granting unlimited traffic; capture observed HTTP 503, time to failure and errors.
5. **Reconnect:** Restore Redis and show HTTP requests recover without API restart. Confirm failed/in-flight calls are not retroactively accepted.
6. **Isolation:** Check `/health/live` and `/health/ready` separately; health routes outside `/api` must not depend on the API rate limiter. Record readiness behavior during the outage.

## Evidence record template

| Date (UTC) | Deployment SHA | Proxy / `TRUST_PROXY` | Redis version | Case | Expected / observed status | Recovery time | Sanitized artifact link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pending staging execution | — | — | — | — | — | — | No deployed result claimed |

Keep identities, credentials, tokens and raw HMAC-derived keys out of artifacts. Record timestamps and whether readiness, 429 budgets, Redis outage, and recovery behaved as expected.

## Release gate
Attach a completed evidence table with request/response samples, sanitized logs, architecture/proxy diagram, observed 429/503 and downtime. Close B7/#140 only after passing the actual deployment drill; unit tests or mocked Redis stores alone are insufficient.
