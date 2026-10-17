# Rate limiting — B7 staging verification

**Status:** Procedure only. No staging run or successful outcome is claimed.

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

## Release gate
Attach a dated evidence table with request/response samples, sanitized logs, architecture/proxy diagram, observed 429/503 and downtime. Close B7/#140 only after passing the actual deployment drill; unit tests or mocked Redis stores alone are insufficient.
