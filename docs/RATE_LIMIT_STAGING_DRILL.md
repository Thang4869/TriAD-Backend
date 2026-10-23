# Rate limiting — B7 staging verification

**Status (2026-10-24):** authenticated Vercel → Render ingress is live. Direct/forged `/api` requests return 403; Vercel catalog returns 200; private correlated logs verify spoof resistance and distinct real network-source identities. Physical Redis outage and idempotency fail-closed/recovery checks PASS on a disposable CI stack. Current evidence and limits supersede the historical pre-gate observations below; see OPERATIONS.md.

## Runtime protections and verification policy

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

Acceptance requires actual hosted source-IP/edge verification and an isolated physical Redis outage drill. Both are recorded in the live rollout section below. Keep `TRUST_PROXY=0`; accept client identity only through the authenticated server-side edge. Never rehearse outages by stopping shared hosted Redis.

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
user agent allows correlation with Render logs. After gate activation the direct request returns 403 and the Vercel catalog returns 200. HTTP status alone does not prove Render derived the correct end-user IP.
Use the Render logs to inspect only the verdict (forged vs peer/proxy-derived)
and publish redacted evidence; never put public user IPs into GitHub artifacts.

**Trust boundary:** the Render hostname remains publicly reachable at the network layer, but the configured `API_EDGE_SECRET` rejects unauthenticated `/api` traffic. Vercel's server-side function overwrites caller-supplied edge headers and supplies the shared credential plus its platform-derived client address. Keep `TRUST_PROXY=0`. Disabling the gate restores the old shared-peer-IP limitation; blindly enabling hop-count trust would reopen spoofing risk. Shared public NATs still intentionally share IP-wide budgets, supplemented by account-specific auth protection.

### Historical ingress canary — before authenticated edge activation

- [GitHub Actions B7 run #39995502666](https://github.com/Thang4869/TriAD-Backend/actions/runs/39995502666) sent two read-only API requests: direct to Render and through Vercel. **Both returned HTTP 200** with `success=true` before the authenticated edge was enabled.
- Render log records correlated by the unique `TriAD-B7-Canary/39995502666` user agent show **the same derived `req.ip` value, `::1`, for both paths** despite a forged `X-Forwarded-For` header in each request. No real end-user IP was captured in the evidence. This proves the current deployment does **not** distinguish the two ingress paths by IP; it does **not** prove multiple public users receive independent rate-limit buckets.
- The direct Render hostname is publicly reachable. With `TRUST_PROXY=0`, ignoring client-supplied forwarded IPs avoids a trivial bypass, but the reverse proxy collapses clients to an internal peer address. Changing to `TRUST_PROXY=1` without an enforced, allowlisted edge would be unsafe. **Real hosted user-IP fairness is NOT ACCEPTED** on this topology.
- A safe remediation requires an authenticated/trusted edge path or network restrictions that prevent untrusted direct traffic from supplying forged forwarded addresses. Until available, maintain global anti-abuse limits and separate auth/account protections; document the residual shared-IP lockout/bypass trade-off.

## Preconditions

### Authenticated edge rollout (live, 2026-10-24)

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
client tests are separate from this live proof. Rollout is now verified on Render `dep-dbdqtrrncjis73d6rbj0` (`c1ff0af`) and canonical Vercel `dpl_3kKVn4MrxjPbo5MusxRLy1DpU9Wg` (`5a5aa7d`). Backend `API_EDGE_SECRET` and `TRUST_PROXY=0` are configured on the existing staging service; the matching credential exists only in Vercel's production environment and Render's secret configuration. No database/Redis instance was interrupted. The branch preview uses a different disposable credential.

Read-only native canaries `TriAD-Edge-Canary/work-mode/a` and `/b` at 2026-10-23 19:02 UTC used different forged XFF/edge headers: Vercel returned 200, direct Render returned 403. Render app logs show the same non-loopback, non-forged client identity for the two requests, and a different identity for the GitHub-hosted Playwright source. Publish only these verdicts, never actual addresses. Hosted cookie/CSRF acceptance on [trusted main run #40008818747](https://github.com/Thang4869/TriAD-12/actions/runs/40008818747) PASS after rollout: **6/6 hosted cases, zero skips**, including mandatory direct-origin rejection. The mandatory direct-ingress regression is merged in frontend PR #38 (`ac87f6f`); trusted-main execution retains the dedicated-account checks.

[B7 #40002408535](https://github.com/Thang4869/TriAD-Backend/actions/runs/40002408535) verifies physical Redis pause/stop and recovery. Idempotency returns 503 after 1,015/1,003 ms with no rejected mutation; resumes with 201 without API restart. Health, 429 and metric checks also PASS. Distinct clients sharing one genuine public NAT intentionally still share the IP-wide budget; separate identity-specific auth buckets supplement it. Synthetic shared-NAT budget tests are not a claim of independently observed public multi-device NAT traffic.

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

## Verified evidence

| Date             | Environment / SHA                         | Case                                | Observed result                                                                                                | Evidence                                                                                                    |
| ---------------- | ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-24 UTC+7 | Hosted Render `c1ff0af`, Vercel `5a5aa7d` | Direct/forged ingress vs proxy      | 403 direct; 200 via Vercel; stable spoof-resistant and distinct network-source identities in private logs      | Live rollout section; OPERATIONS.md                                                                         |
| 2026-10-24 UTC+7 | Disposable CI `815b15c`                   | Physical Redis pause/stop/reconnect | Rate limit and idempotency 503, no rejected mutation, readiness 503/liveness 200, recovery without API restart | [B7 #40002408535](https://github.com/Thang4869/TriAD-Backend/actions/runs/40002408535) + sanitized artifact |
| 2026-10-24 UTC+7 | Hosted canonical frontend `ac87f6f`       | Cookie/CSRF/refresh/logout          | Trusted main acceptance 6/6 PASS after secret configuration                                                    | [Frontend #40008818747](https://github.com/Thang4869/TriAD-12/actions/runs/40008818747)                     |

Keep identities, credentials, tokens and raw HMAC-derived keys out of artifacts. Record timestamps and whether readiness, 429 budgets, Redis outage, and recovery behaved as expected.

## Release gate

The table and live rollout section provide current acceptance. Keep these checks for future releases: deployed source-IP/edge proof plus disposable outage/429/503/recovery evidence are required; unit tests or mocked Redis alone are insufficient. No outage is induced on the shared hosted service.

## Bounded hosted 429 regression

The dedicated [Hosted authenticated ingress acceptance workflow](../.github/workflows/hosted-ingress-acceptance.yml) runs only when its own definition/script changes in a PR, or by manual dispatch. It sends at most 103 GETs to the fixed functional staging catalog from its runner source, stops on 429, then verifies two different forged XFF/edge inputs still receive 429. It never changes limits, uses credentials, writes business data or publishes real addresses. A 50-second verification bound and limit cap of 100 prevent an unbounded load test. The sanitized `hosted-ingress-429-evidence` artifact records counts, observed limit, timing and verdict. Keep the successful run link in #140; use ordinary low-volume canaries for other PRs.
