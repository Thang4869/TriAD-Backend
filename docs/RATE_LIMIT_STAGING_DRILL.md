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
  have a 1000ms timeout. An additional **1500ms HTTP middleware deadline**
  handles stalls while the RedisStore itself is waiting for lazy Lua
  initialization; late callbacks are ignored after the 503 response.
  Startup Lua `SCRIPT LOAD` is intentionally exempt:
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
This is deliberately _not_ a deployment proxy drill.

**Still required to close #140:** independently establish actual Render
ingress hop/IP behavior and whether `/api` is directly reachable in addition
to the Vercel rewrite; verify it without leaking test client identities.
Rehearse Redis outage/reconnect on an **isolated, disposable** stack, not by
shutting down the shared Render staging Key Value service. Record 429/503
observations, health/readiness, recovery timestamps, sanitized metrics and
shared-NAT fairness. Keep `TRUST_PROXY=0` until a reviewed, verified trust
boundary is available. An isolated CI Redis disconnect test is not evidence
for Render ingress behavior.

## Automated B7 CI acceptance — 2026-10-24

The opt-in [`B7 proxy and Redis acceptance`](../.github/workflows/b7-acceptance.yml)
workflow runs two independent jobs on relevant PRs and by manual dispatch on
`main`. Neither job is given staging credentials or mutable hosted secrets.

**Disposable Redis + real HTTP proxy hop.** The runner creates its own
`redis:7-alpine` Docker container, mapped to `127.0.0.1:16379`, and runs
`scripts/acceptance/b7-isolated-proxy-redis.cjs`. The script refuses execution
without the explicit opt-in, `NODE_ENV=test`, loopback-only Redis URL and
the unique disposable container name. On failure or success the workflow
unpauses and destroys the disposable container. The backend process is not
restarted during the outage tests. Assertions cover:

- Direct API requests with three spoofed `X-Forwarded-For` values hitting a
  shared limit and receiving HTTP 429 under `TRUST_PROXY=0`.
- An actual HTTP reverse-proxy TCP hop on loopback with header sanitization;
  two **simulated** clients behind the same RFC5737 NAT address share an IP
  budget and a different simulated source remains independent. This also
  demonstrates the fairness trade-off of per-IP buckets for shared NATs.
- A paused Redis server returning bounded HTTP **503**, readiness **503** and
  liveness **200**, then recovering without API restart.
- A stopped Redis container returning HTTP **503**, then recovering after
  `docker start` without API restart.
- Failure metrics include only fixed `operation` and `reason` labels,
  never client IDs, IPs, headers, tokens, Redis URLs or keys.

Output is a sanitized `b7-isolated-evidence.json` GitHub Actions artifact,
not raw request logs, secrets or Redis state. RFC5737 addresses are test
fixtures; this job **does not establish real hosted source-IP handling**.

**Hosted ingress canary.** The second job sends two read-only public
`GET /api/products` requests with a forged documentation-only XFF header,
directly to `triad-api-staging.onrender.com` and through
`triad-staging-three.vercel.app/api`. The unique `TriAD-B7-Canary/RUN_ID`
user agent allows correlation with Render logs. HTTP 200 and catalog success
prove reachability, **not** that Render derived the correct end-user IP.
Use the Render logs to inspect only the verdict (forged vs peer/proxy-derived)
and publish redacted evidence; never put public user IPs into GitHub artifacts.

**Trust-boundary limitation:** Render's public API currently allows direct
connections and Vercel forwards via rewrite. Do **not** enable hop-count
`TRUST_PROXY=1` just to separate users: untrusted direct clients could
then choose arbitrary XFF addresses and evade per-IP limits. Leave
`TRUST_PROXY=0` until a verified allowlisted proxy address range (or a
network restriction preventing direct bypass) is available. This means that
fairness between users behind the same ingress/proxy remains a documented
residual risk. If this cannot be remedied on current Free hosting, leave #140
open (or explicitly accept the risk through an issue decision); never call
the simulated NAT test an actual multi-public-IP production proof.

### Hosted ingress canary — observed 2026-10-24

- [GitHub Actions B7 run #39995502666](https://github.com/Thang4869/TriAD-Backend/actions/runs/39995502666) sent two read-only API requests: direct to Render and through Vercel. **Both returned HTTP 200** with `success=true`.
- Render log records correlated by the unique `TriAD-B7-Canary/39995502666` user agent show **the same derived `req.ip` value, `::1`, for both paths** despite a forged `X-Forwarded-For` header in each request. No real end-user IP was captured in the evidence. This proves the current deployment does **not** distinguish the two ingress paths by IP; it does **not** prove multiple public users receive independent rate-limit buckets.
- The direct Render hostname is publicly reachable. With `TRUST_PROXY=0`, ignoring client-supplied forwarded IPs avoids a trivial bypass, but the reverse proxy collapses clients to an internal peer address. Changing to `TRUST_PROXY=1` without an enforced, allowlisted edge would be unsafe. **Real hosted user-IP fairness is NOT ACCEPTED** on this topology.
- A safe remediation requires an authenticated/trusted edge path or network restrictions that prevent untrusted direct traffic from supplying forged forwarded addresses. Until available, maintain global anti-abuse limits and separate auth/account protections; document the residual shared-IP lockout/bypass trade-off.

## Preconditions

### Authenticated edge rollout (candidate, 2026-10-24)

`createTrustedEdgeMiddleware` now supports an optional server-only
`API_EDGE_SECRET` (32–256 characters). When configured, **every `/api` method**,
including OPTIONS, requires the server-side edge credential and a single valid
`X-Triad-Client-Ip`. The credential is compared in constant time and removed
before logging/routes. Health routes remain public. With no secret, local and
existing deployments retain their previous behavior and ignore edge IP headers.
`TRUST_PROXY` must remain `0`; do not enable hop-count trust.

The paired frontend replaces the external rewrite with a Node.js Vercel
Function. It accepts only Vercel's overwritten `x-vercel-forwarded-for`, replaces
incoming edge headers, forwards to the fixed Render origin, and never follows
upstream redirects with credentials. Cookies, CSRF, idempotency headers, methods,
query and body are preserved. The server secret is never named `VITE_*`.
Vercel's function request-size limit applies (4.5 MB including multipart overhead),
even though the direct backend upload cap is 5 MiB. Larger uploads need a separate
reviewed direct-upload design; they must not bypass the API edge.

Rollout order: set the same random secret on the two **staging** hosting services;
deploy the backend code **without** enabling its gate, deploy/verify the frontend
proxy with its secret, then enable the backend secret and redeploy it. During
rotation, coordinate both services; a key mismatch fails closed. Roll back by
disabling the backend gate before reverting the frontend proxy. Never publish
the secret, request headers, cookies or real client addresses as evidence.

Required deployed acceptance: direct Render `/api/products` with missing/forged
edge headers returns 403; Vercel catalog and cookie/CSRF journeys still pass;
spoofed XFF cannot choose buckets; distinct real clients get distinct budgets,
while shared NAT remains intentionally shared. Unit and real-Redis synthetic
client tests are separate from this live proof. **#140 remains open until rollout
and deployed acceptance.** No hosting configuration has been changed by this code.

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

| Date (UTC)                | Deployment SHA | Proxy / `TRUST_PROXY` | Redis version | Case | Expected / observed status | Recovery time | Sanitized artifact link    |
| ------------------------- | -------------- | --------------------- | ------------- | ---- | -------------------------- | ------------- | -------------------------- |
| Pending staging execution | —              | —                     | —             | —    | —                          | —             | No deployed result claimed |

Keep identities, credentials, tokens and raw HMAC-derived keys out of artifacts. Record timestamps and whether readiness, 429 budgets, Redis outage, and recovery behaved as expected.

## Release gate

Attach a completed evidence table with request/response samples, sanitized logs, architecture/proxy diagram, observed 429/503 and downtime. Close B7/#140 only after passing the actual deployment drill; unit tests or mocked Redis stores alone are insufficient.
