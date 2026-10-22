# Operations Runbook

## First response

1. Check `/health/ready` and `/metrics`.
2. Check application logs using the request id and relevant order or outbox event id.
3. Confirm PostgreSQL and Redis connectivity before restarting workers.
4. Do not manually delete outbox rows; they are production recovery state.

## Bring up isolated cloud staging

Use the root [`render.yaml`](../render.yaml) for the first functional staging
stack: one production Docker API with its existing BullMQ workers and Outbox
Relay, a private PostgreSQL database and a private Key Value instance. It does
not enable Google/Facebook login or add a payment gateway. Keep the application
in `NODE_ENV=production` so cookie security and internal-route protection match
the deployed behavior under test.

Before applying the Blueprint, confirm the Render workspace, inspect existing
resources to avoid duplicates, and merge the reviewed configuration. The new
resources are colocated in Singapore. Do not repoint staging at a production
database or reuse production credentials. Automatic deployment and automatic
PR stacks are disabled; deploy an explicit reviewed commit.

### Provision and configure

1. Apply the Blueprint in the confirmed workspace. Check whether the workspace
   already uses its Free Postgres/Key Value allowance before provisioning.
2. Enter the actual `FRONTEND_URL`, matching allowed origins in `CORS_ORIGIN`,
   SMTP host/port/user/password/from address, and Cloudinary credentials in the
   hosting dashboard. `sync: false` prompts only on initial creation; later
   changes must be entered on the existing service. Do not use dummy provider
   values to bypass production configuration checks. Free web services block
   outbound SMTP ports 25, 465 and 587. Verify that the chosen SMTP provider
   supports an allowed port (such as 2525), or review a paid web-service plan
   before accepting verification-email delivery. Port 25 is blocked on every
   plan; do not substitute it.
3. Render generates independent JWT secrets and a base64-encoded 32-byte TOTP
   key, and injects private datastore URLs from Blueprint references. Keep
   `COOKIE_DOMAIN` unset when frontend and API use unrelated hosting domains.
4. Verify the frontend hosting connection has access to the intended team and
   repository before creating a Vite deployment. Use the real backend API URL
   for `VITE_API_BASE_URL`; validate cookie/CSRF behavior in a real browser.
   If introducing an API proxy, review its effect on client IP attribution and
   OAuth callback URLs before enabling it.
5. Start the API and verify the deploy reaches `live`. The staging-only
   `scripts/start-staging.sh` runs `prisma migrate deploy`, then uses `exec` to
   start the HTTP process. It refuses to run without
   `TRIAD_DEPLOYMENT_ENV=staging`. The default production Docker command keeps
   its existing explicit-migration policy. Review schema compatibility before
   each staging deploy; this guard does not identify which database a URL owns.

`TRUST_PROXY` starts at the conservative value `0`. Establish the actual ingress
topology and run the reverse-proxy drill before changing it or accepting #140.
Until then, multiple clients can share a proxy IP budget. Do not enable a
trust-all setting to make a smoke check pass.

### Verify the running deployment

Copy the API origin from the actual Render service, then run from the backend
checkout (PowerShell):

```powershell
$env:STAGING_BASE_URL="https://<actual-staging-api-host>"
npm run smoke:staging
```

The command issues only GET requests. It requires healthy liveness and
database/cache/queue readiness, a successful public products response, and HTTP
404 for unauthenticated `/metrics` and `/api/docs`. It rejects redirects, HTML
login pages and timed-out requests. The output records the origin, time and
checked statuses without response bodies or credentials. A cold Free service
can need a longer first request: set `STAGING_SMOKE_TIMEOUT_MS=90000` for that
run, then measure normal response times separately.

Record the actual deploy ID/commit, plan, date and sanitized smoke output.
Continue with browser login, refresh, cart and COD checkout, verification-email
delivery, worker processing, and the dedicated failure drills below. A passing
HTTP smoke does not establish all of those acceptance criteria.

### Add a catalog for login, cart and COD testing

Do **not** run `npm run seed` or `prisma:reset` on cloud staging. The legacy
development seed deletes existing records and creates accounts with default
passwords. Use `scripts/seed-staging-catalog.cjs` instead; it creates three
clearly marked `[STAGING]` products and their public catalog projections in one
transaction. It does not create users, send email, or create orders.
Fixtures use UUIDs compatible with product routes. Cart add/update validation
accepts those UUIDs and legacy CUIDs, preserving existing product identifiers.

1. Review and merge the catalog-seed change. Confirm that the API still uses
   the isolated PostgreSQL resource from this Blueprint, whose logical database
   name is `triad_staging`; keep external database access disabled. Both
   `TRIAD_DEPLOYMENT_ENV=staging` and an actual `current_database()` check gate
   the seed. These checks supplement the resource/connection review; a database
   name alone is not proof of production isolation.
2. On the existing **staging API service**, temporarily set
   `TRIAD_SEED_STAGING_CATALOG=true`, preserving all other environment variables.
   Deploy the reviewed main commit. The staging entrypoint runs migrations,
   then the seed, then the application. A failed seed prevents application
   startup; its transaction rolls back catalog writes. The normal production
   Docker command never invokes it.
3. Check the seed's count-only completion log and that the deploy reaches
   `live`. Verify `/health/ready`, `/api/products`, product images and the
   frontend catalog. The three image paths (`/images/21.jpg`, `22.jpg`, `23.jpg`)
   refer to assets in the paired TriAD frontend, not new uploads.
4. Set `TRIAD_SEED_STAGING_CATALOG=false` after verification and confirm the
   resulting deployment is healthy. Unset also means disabled; other values
   are rejected. Rerunning preserves existing records, edited prices, stock,
   versions and projections, and can add a missing fixture projection from
   the persisted product and review data. Reserved identifier conflicts fail
   rather than overwrite unrelated data. This is not a general projection
   rebuild or a stock-reset command.
5. Register a personal staging test account through the UI using a private,
   unique password, then verify login, cart and a staging COD order. No admin
   or shared password is provisioned. Record mail delivery and browser results
   separately; successful seeding does not establish those acceptance criteria.

For script verification, run
`node --test tests/scripts/staging-catalog.test.cjs`. CI also runs
`tests/scripts/staging-catalog.postgres.test.cjs` against its disposable local
Postgres service, checking retries, concurrent runs and transaction rollback.
That database test requires `STAGING_CATALOG_TEST_SERVER_URL` pointing to a
loopback `triad_test` server with permission to create a fresh `triad_staging`
database; it refuses to reuse an existing database. Never point it at Render.

### Deployed staging evidence — 2026-10-22

The catalog and browser checks below were observed on the actual cloud staging
stack. The initial checkout pricing discrepancy is retained as history; the
reviewed-quote re-acceptance below records the deployed fix and its limits.
A successful CI run does not replace a deployed browser check.

| Item                        | Observed result                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend source              | [`a716071402dc1118da3d19ad8d5d2a8347cf53c9`](https://github.com/Thang4869/TriAD-Backend/commit/a716071402dc1118da3d19ad8d5d2a8347cf53c9), merging [PR #210](https://github.com/Thang4869/TriAD-Backend/pull/210) |
| Runtime                     | `triad-api-staging`, Render Singapore, Free; `sh scripts/start-staging.sh`; `/health/ready` health check                                                                                                         |
| Isolation                   | `triad-postgres-staging`, logical database `triad_staging`, available with external IP allowlist `[]`                                                                                                            |
| Baseline                    | Public catalog returned zero products before enabling the seed                                                                                                                                                   |
| Seed deploy                 | `dep-dbcq62om7kps73cipgo0`, same backend source, `live` at 12:46:37 UTC+7                                                                                                                                        |
| Seed result                 | Three products and three catalog projections created in one successful run                                                                                                                                       |
| Seed disabled               | `TRIAD_SEED_STAGING_CATALOG=false`; deploy `dep-dbcq7ihsrm7s73bliel0` reached `live` at 12:49:51 UTC+7                                                                                                           |
| Persistence after disabling | At 12:51:10 UTC+7, the API still returned all three fixture UUIDs with stock 12 each                                                                                                                             |
| Frontend                    | [Products page](https://triad-staging-three.vercel.app/pages/products.html) rendered three `[STAGING]` cards; all three product images loaded                                                                    |

The service environment update merged only the seed flag, preserving the other
variables. Render initiated both configuration deploys automatically; no
additional manual deploy was triggered. The disabled flag matches the
Blueprint default again. The post-disable startup log window contained no
catalog-seed completion entry.

Sanitized application log (the original timestamp is UTC):

```text
2026-10-22T05:46:20.972981062Z Staging catalog seed complete: {"productsCreated":3,"projectionsCreated":3}
```

At 12:51:03 UTC+7, `scripts/smoke-staging.cjs` passed against
`https://triad-api-staging.onrender.com`:

| GET endpoint    | HTTP status                                                      |
| --------------- | ---------------------------------------------------------------- |
| `/health/live`  | 200                                                              |
| `/health/ready` | 200; database, cache and queues satisfied the readiness contract |
| `/api/products` | 200                                                              |
| `/metrics`      | 404                                                              |
| `/api/docs`     | 404                                                              |

The catalog response also allowed the exact frontend origin
`https://triad-staging-three.vercel.app` with credentials enabled. This header
check does not establish authenticated cookie or CSRF behavior.

To reproduce the HTTP check from a checkout of this source (PowerShell):

```powershell
$env:STAGING_BASE_URL="https://triad-api-staging.onrender.com"
$env:STAGING_SMOKE_TIMEOUT_MS="50000"
npm run smoke:staging
```

Authenticated browser evidence from 2026-10-22:

- Frontend source `e1fa9249a939fc200d35070de0001fcb26e4c27b` (PR #29),
  Vercel deployment `dpl_3fXjawnZECQ14p23pHTxKVns1iG4`, canonical origin
  `https://triad-staging-three.vercel.app`; `VITE_API_BASE_URL=/api` uses the
  fixed HTTPS Render rewrite. Backend runtime source remains `a716071`.
- Password login succeeded with a verified staging account. The user reported
  receiving the verification email. A product was added through the product
  modal; quantity changed `1 → 2 → 1`. A page reload retained both sign-in
  and the two-item cart before the final decrease.
- One synthetic COD order was created:
  `ORD-3CFBE0F48A5B485997D1930347AD1015`. The confirmation showed subtotal
  150,000 VND, tax 15,000, shipping 30,000, discount 0, total 195,000; the cart
  then became empty. The submitted contact data was synthetic and the notes
  explicitly prohibit fulfillment/contact.
- **Initial acceptance blocker (resolved by the re-acceptance below):** the
  pre-submit UI had shown only 180,000 VND.
  The required fix was to load the server quote (including tax/shipping/discount)
  before enabling placement and reject a changed reviewed total transactionally.
  The deployed price comparison is recorded below; the initial order alone did
  not establish a checkout PASS.

#### Reviewed-quote and logout re-acceptance — 2026-10-22

The paired changes were merged in [backend PR #212](https://github.com/Thang4869/TriAD-Backend/pull/212)
and [frontend PR #30](https://github.com/Thang4869/TriAD-12/pull/30).
The following checks used the existing isolated staging resources, without
reseeding the catalog or changing hosting plans, secrets or network access.

| Item                | Observed result                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend             | Source [`227c9fb6c87c647c1fe54e8171101ba9015c0c5f`](https://github.com/Thang4869/TriAD-Backend/commit/227c9fb6c87c647c1fe54e8171101ba9015c0c5f); deploy `dep-dbcvsnm7bikc73a2uvn0` reached `live` at 19:16:38 UTC+7                                                                                                                                                       |
| Frontend            | Source [`f3a3807c5f6f6a5c58906000771122e4f2fae5d3`](https://github.com/Thang4869/TriAD-12/commit/f3a3807c5f6f6a5c58906000771122e4f2fae5d3); deployment `dpl_6Ynk6MrMZzkFQ3UX9eEzUz7N2xeq` was `READY` and served the canonical origin                                                                                                                                     |
| Current CI          | [Backend CI](https://github.com/Thang4869/TriAD-Backend/actions/runs/39771989596) and [frontend Test & Coverage](https://github.com/Thang4869/TriAD-12/actions/runs/39771940005) passed on those merge commits. The backend fullstack job checked out exactly those two SHAs and passed the checkout journey (one test). These are CI fixtures, not cloud failure drills. |
| Deployed HTTP smoke | At 19:17:23 UTC+7, `smoke:staging` returned 200 for `/health/live`, `/health/ready`, `/api/products`, and 404 for unauthenticated `/metrics`, `/api/docs`                                                                                                                                                                                                                 |
| Authenticated cart  | A verified staging account signed in and added one `[STAGING] TriAD Storage Container 1000ml` through the product modal                                                                                                                                                                                                                                                   |
| Before submission   | Checkout showed placeholders and disabled placement while loading the quote; the loaded quote showed subtotal 150,000 VND, tax 15,000, shipping 30,000, discount 0, total **195,000**                                                                                                                                                                                     |
| COD receipt         | Synthetic order `ORD-646B265403AE41229EA6D273F44986B9` succeeded with the same breakdown and total **195,000**; the cart became empty and checkout was disabled                                                                                                                                                                                                           |
| Logout              | The account control changed to `Đăng nhập`; after a full reload and catalog load, the page still showed `Đăng nhập` and an empty cart                                                                                                                                                                                                                                     |

The test order used synthetic contact fields and notes explicitly prohibiting
fulfillment, shipping and contact. It is a non-production acceptance fixture,
not a real purchase. The previous 180,000-versus-195,000 discrepancy is resolved
for this deployed COD path. The browser pass did not alter live prices or inject
a crash, lost response or Redis failure. Changed-total rejection and transaction
rollback have automated PostgreSQL integration coverage in PR #212 and the
passing backend CI; those tests do not establish cloud fault-recovery acceptance.

Still pending: explicit refresh/rotation and token replay after logout,
negative CSRF cases, proxy client-IP/rate-limit behavior, Cloudinary upload,
and worker/recovery drills. Keep the related checklist gates open until those
checks have their own dated evidence. The GitHub state of #143 is currently
closed, but its documented deployment/RPO/worker acceptance remains incomplete;
do not infer a production recovery PASS from that state.

### Limits of the initial Free stack

This Blueprint is for temporary functional testing. Free web services can
sleep after idle time, stopping in-process workers and the relay; Free Postgres
expires after 30 days and has no managed backups; Free Key Value does not
persist data across restarts. `noeviction` prevents memory-pressure eviction,
not restart data loss. This stack therefore does not prove continuous worker
availability, durable queue recovery or production RTO/RPO. Choose persistent
datastores and suitable always-running compute before accepting those gates.
Require the full recovery evidence for #143 before accepting that gate;
the GitHub issue state alone does not establish acceptance.

References: [Blueprint specification](https://render.com/docs/blueprint-spec),
[Free-instance limits](https://render.com/docs/free), and
[Key Value persistence](https://render.com/docs/key-value#data-persistence).

## Failure-drill index and safety boundary

Use the dedicated evidence procedures for recovery, rate-limit availability and checkout idempotency:

- PostgreSQL backup, restore and projection rebuild: [`RECOVERY_DRILL.md`](RECOVERY_DRILL.md).
- Reverse-proxy trust and Redis rate-limit failure/recovery: [`RATE_LIMIT_STAGING_DRILL.md`](RATE_LIMIT_STAGING_DRILL.md).
- Idempotency leases, durable checkout recovery and Redis outages: [`IDEMPOTENCY_RECOVERY.md`](IDEMPOTENCY_RECOVERY.md).

Run these procedures **only in an isolated non-production environment** with a documented test window. A local Docker Compose environment is valid for a **local production-like drill** when topology, resources, test commands and sanitized results are recorded. A local PASS does **not** establish deployed/cloud staging acceptance. CI results prove only their automated fixtures. Never use production data or credentials for fault injection; report deployed staging PASS only with dated, sanitized evidence from that deployment.

## Trusted proxy configuration (B10/B7)

`TRUST_PROXY` is a security boundary for Express `req.ip`, HTTP rate
limiting, IP-based logs and audit information. Default `0` ignores
`X-Forwarded-For` from untrusted clients. Set an explicit number of proxy
hops only when requests can reach the app **exclusively through those proxy
hops**; otherwise use controlled proxy IPs/IPv4 CIDRs (for example,
`TRUST_PROXY=10.0.0.0/8` with verified network access rules).

Startup rejects broad `true`/trust-all values, arbitrary aliases, invalid
hop counts, IPv6 CIDRs, and IPv4-mapped IPv6 CIDRs. These conservative
startup restrictions remain a defense-in-depth policy even after the B10
branch upgrades `proxy-addr` to `2.0.8`; review actual proxy topology before
relaxing them. Explicit IPv6 proxy **IP addresses** such as `::1` remain
valid.

On staging, verify both direct connection spoof attempts (the supplied
`X-Forwarded-For` must not become `req.ip`) and legitimate requests via
the configured proxy. Incorrect trust configuration can both bypass IP
rate limits and unfairly group different users into one shared bucket.

## Rate-limit policy and Redis outage response (B7)

The general `/api` limiter uses `RATE_LIMIT_WINDOW_MS` (default 60 seconds)
and `RATE_LIMIT_MAX` (default 100), keyed by Express `req.ip`.
Health probes are **outside** the `/api` rate-limiter mount; no path-name
skip exists. The auth routes have additional independent Redis budgets:

| Request group                          | Window     | Budget | Key scope                                 |
| -------------------------------------- | ---------- | ------ | ----------------------------------------- |
| Register / login / resend verification | 1 hour     | 60     | Trusted client IP, combined across routes |
| Register / login / resend verification | 1 hour     | 10     | Trusted client IP + normalized email      |
| Verify TOTP                            | 15 minutes | 20     | Trusted client IP                         |
| Verify TOTP                            | 15 minutes | 5      | Trusted client IP + pre-auth token        |
| Refresh token                          | 15 minutes | 30     | Trusted client IP                         |

Email and pre-auth token bucket components use domain-separated HMAC-SHA256
with `JWT_ACCESS_SECRET`; raw identifiers/tokens must not be stored in
rate-limit Redis keys. Rotating that signing secret also changes rate-limit
bucket identities. The IP component is derived from Express `req.ip`;
never read an untrusted `X-Forwarded-For` header directly. Configure
`TRUST_PROXY` for the actual trusted reverse-proxy topology only, otherwise
clients may be incorrectly grouped or may spoof apparent addresses.

**Fail-closed:** Redis not ready => immediately reject the limiting check;
a Redis command that rejects or does not respond within one second is mapped
to `DependencyUnavailableError` (503). `passOnStoreError: false` prevents
the request from continuing without a limit. A timed-out Redis operation may
still complete later internally; the timeout bounds the HTTP wait, not the
underlying Redis command lifecycle. Lua `SCRIPT LOAD` during
rate-limit store initialization is the sole exception: it must queue until
Redis is ready instead of rejecting during module import. Subsequent HTTP
rate-limit commands still fail closed. Monitor 503 rates and Redis connectivity.

**Residual risks and release verification:** shared offices/NAT users can
exhaust each other's IP budget; IP rotation and IPv6 privacy addresses can
evade simple per-address limits. Tune thresholds from deployed observations.
Check reverse-proxy trust configuration, health probes, Redis outage and
recovery, 429 responses, and normal login/TOTP/refresh flows before declaring
this security gate fully closed.

## Projection event-age percentiles (T2)

After each **successful handler execution** (including an idempotent stale-event no-op), the handler records:

- `triad_backend_projection_lag_seconds`: a gauge for the most recently
  processed event. This gauge **cannot** provide historical p95/p99.
- `triad_backend_projection_event_age_seconds`: a histogram of the age of
  each successfully handled event (completion time minus `occurredAt`).
  Its Prometheus buckets support approximate p95/p99 by projection.

For example, calculate p95 over a 15-minute window:

```promql
histogram_quantile(
  0.95,
  sum by (le, projection) (
    rate(triad_backend_projection_event_age_seconds_bucket[15m])
  )
)
```

Use `0.99` for p99. This is **successful event processing age**, not a
measurement of end-user order-list freshness or the total time spent
waiting in an unprocessed outbox. Failed updates do not contribute
samples. Replayed successful events may contribute additional samples,
and an idle period may yield no quantile. Monitor
`triad_backend_outbox_lag_seconds` and dead-letter backlog alongside
the histogram. Set a numeric staleness SLO **only after staging load
and read-after-write measurements**, not from synthetic unit tests.

## Orders read-after-write behavior

Checkout returns the committed write-side order directly, including an
idempotency-retry recovery path. The canonical `GET /api/orders` list is
served from `order_history_projection` and is eventually consistent.
`GET /api/orders/{orderId}` tries the projection first, then queries
the owner-scoped write model if the projection row is absent, so a newly
committed order remains readable by ID even before the outbox relay catches up.

This fallback is intentionally **missing-row only**. An existing projection
may lag behind a later order-status update; this endpoint does not guarantee
immediate visibility of those updates. No fixed projection-lag SLA has been
measured yet. Monitor outbox lag and establish an SLO from deployment evidence
before claiming a numeric staleness bound.

`/api/checkout/orders` and `/api/checkout/orders/{orderId}` are legacy
direct-write read endpoints kept for frontend compatibility. Prefer the
`/api/orders` API in new clients. The two API families have different
response shapes; do not silently redirect legacy traffic without updating
consumers and contract tests.

When investigating a missing order, first check the owner-scoped `orders`
row, then `order_history_projection`, then outbox lag/dead letters.
Never bypass the `userId` ownership check in fallback queries.

## Outbox lag or dead letters

- Inspect `triad_backend_outbox_lag_seconds`, `triad_backend_outbox_dead_lettered_events`, claimed/published/failed counters and `outbox_events` rows with `publishedAt IS NULL`.
- Verify the relay process is running and database connections are not exhausted.
- Check `leaseUntil`, `attempts` and `lastError`. Expired leases are safe to reclaim.
- Fix the downstream handler or dependency, then explicitly requeue selected dead-letter events with `npm run outbox:replay`; the normal relay performs delivery afterward. Preserve event ids so handler idempotency remains effective.

`triad_backend_outbox_lag_seconds` is the age of the oldest unpublished,
non-dead-lettered event. It includes events waiting for retry/backoff and
events currently leased by another relay; it is not a claimability metric.
Published rows and unresolved dead-letter rows do not contribute to active
lag. `triad_backend_outbox_dead_lettered_events` is the current count of
unpublished rows with `deadLetteredAt` set. It complements, rather than
replaces, `triad_backend_outbox_events_dead_lettered_total`, which counts
dead-letter transitions over the process lifetime.

The relay refreshes both values from an authoritative database aggregate on
every poll, including empty claim batches. If that read fails, the relay logs
the observability error and keeps the last valid metric values while delivery
continues.

### Dead-letter replay

Dead-letter events are never reclaimed automatically. An operator must first
fix the failing handler or downstream dependency, inspect the affected rows,
and explicitly requeue the selected events.

Inspect unresolved dead letters:

```sql
SELECT
  id,
  "eventName",
  "aggregateId",
  attempts,
  "occurredAt",
  "deadLetteredAt",
  "lastError"
FROM outbox_events
WHERE "publishedAt" IS NULL
  AND "deadLetteredAt" IS NOT NULL
ORDER BY "deadLetteredAt" ASC;
```

Replay one or more dead-letter events by their existing outbox ids:

```bash
npm run outbox:replay -- --ids="event-id-1,event-id-2"
```

Replay has the following safety rules:

- every requested id must still exist as an unpublished dead-letter event;
- the complete selection is requeued atomically; partial replay is rejected;
- the original outbox event id and payload are preserved;
- `attempts`, `deadLetteredAt`, `lastError` and stale lease metadata are reset;
- existing `outbox_handler_log` rows are preserved;
- handlers already recorded as `SUCCESS` are skipped on replay;
- handlers that previously failed may run again;
- projection handlers still enforce their `sourceVersion` CAS/idempotency rules.

Preserving the original outbox id is required for handler-level idempotency.
Do not copy a dead-letter row into a new outbox event merely to replay it,
because doing so creates a new event identity and can repeat external side
effects.

After requeueing, verify that the normal relay claims and publishes the event:

```sql
SELECT
  id,
  attempts,
  "publishedAt",
  "deadLetteredAt",
  "lockOwner",
  "leaseUntil",
  "lastError"
FROM outbox_events
WHERE id IN ('event-id-1', 'event-id-2');
```

A successfully replayed event should eventually have `publishedAt` set and no
active lease. If it dead-letters again, stop replaying it repeatedly and
investigate the handler or dependency recorded in `lastError`.

### Published outbox retention

Only already-published events are eligible for retention cleanup. Pending,
leased and unpublished dead-letter events are recovery state and must not be
removed by the cleanup command.

The cleanup command defaults to:

- retention: 30 days;
- maximum deletion batch: 500 rows;
- dry-run mode.

Preview eligible rows without deleting anything:

```bash
npm run outbox:cleanup
```

Use a different retention window or batch size while remaining in dry-run mode:

```bash
npm run outbox:cleanup -- --retention-days=60 --limit=1000
```

After reviewing the reported eligible count, explicitly add `--execute` to
perform one bounded deletion batch:

```bash
npm run outbox:cleanup -- --retention-days=30 --limit=500 --execute
```

The cleanup query deletes only rows where `publishedAt` is older than the
retention cutoff. Related `outbox_handler_log` rows are removed by the
database foreign-key cascade only when their published outbox event is
deleted.

Run cleanup repeatedly in bounded batches when a large backlog exists rather
than issuing one unbounded delete. Monitor database load between batches.

Verify remaining published rows around the cutoff:

```sql
SELECT
  COUNT(*) AS eligible
FROM outbox_events
WHERE "publishedAt" IS NOT NULL
  AND "publishedAt" < NOW() - INTERVAL '30 days';
```

### Outbox maintenance indexes

The relay claim path and published-event cleanup path use PostgreSQL partial
indexes created by migration
`20261003020000_outbox_maintenance_indexes`.

The relay claim index covers only unpublished, non-dead-letter events.

Verify the indexes:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'outbox_events'
  AND indexname IN (
    'outbox_events_relay_claim_idx',
    'outbox_events_published_cleanup_idx'
  );
```

Expected indexes:

- `outbox_events_relay_claim_idx` for relay candidate selection by
  `attempts`, `leaseUntil` and `occurredAt`;
- `outbox_events_published_cleanup_idx` for retention cleanup ordered by
  `publishedAt`.

These indexes are intentionally defined in SQL migration rather than
`schema.prisma` because they use PostgreSQL partial-index predicates.

## Outbox payload schema and versioning

New outbox payloads are persisted with `schemaVersion: 1`. The relay validates
the serialized event envelope before dispatching it to `EventBus`.

Validation currently requires:

- a supported integer `schemaVersion`;
- non-empty `eventName` and `aggregateId`;
- payload `eventName` and `aggregateId` to match the authoritative outbox row;
- a valid `occurredAt` value;
- non-negative integer `version` / `sourceVersion` when present;
- object-shaped `metadata` when present.

Rows created before schema versioning was introduced may omit
`schemaVersion`; they are treated as legacy schema version 1 so existing
pending outbox data is not invalidated solely by the rollout.

An unsupported version or malformed payload is never dispatched to event
handlers. The validation error follows the normal relay failure lifecycle:
immediate retry, one durable `attempts` increment after immediate retries are
exhausted, backoff, and eventually dead-lettering at the configured maximum
attempt count. Because dispatch never starts, no handler result is written for
that invalid event.

Do not manually edit an invalid payload merely to bypass validation. First
identify whether the producer wrote an invalid envelope, whether an unsupported
schema version requires a compatible reader/upcaster, or whether the row is
corrupt. Use `lastError` and the dead-letter workflow above to diagnose and
recover the event deliberately.

`schemaVersion` is an infrastructure serialization contract. It is intentionally
not added to `DomainEvent`; handlers continue to receive the deserialized domain
event without the envelope-only `schemaVersion` field.

## Outbox delivery and relay leases

Outbox delivery is at-least-once, not exactly-once. A process can finish a
handler and crash before persisting `publishedAt`, so handler tracking and
projection CAS remain required even when relay ownership is correct.

Multiple relay instances may process events for the same aggregate at the
same time, and handler completion order is not guaranteed. Current consumers
are order-tolerant: order and product projections apply only newer
`sourceVersion` values, equal versions are idempotent, stale versions are
ignored, and missing order prerequisites are retried. Email and notification
side effects use stable event-derived idempotency keys plus the handler
tracker. Do not infer aggregate order from `occurredAt`, UUIDs or
`updatedAt`; a new consumer that requires strict order must add its own
version/CAS or explicit ordering invariant.

The production relay defaults are a 2 second poll interval, batch size 50,
10 maximum attempts and a 60 second lease. Every claimed batch has a
heartbeat that renews all still-pending rows about three times per lease
period. A row is renewed or updated only when `lockOwner` still matches, the
row is unpublished and its lease has not expired. `leaseUntil` is the current
ownership deadline and `lockOwner` identifies the relay allowed to mutate the
claim. If renewal or completion reports ownership loss, the stale relay does
not mark the row published, clear the replacement lease or overwrite retry
metadata. If a relay disappears, its heartbeat stops and another relay can
reclaim the row after `leaseUntil`.

Stopping a relay stops scheduling new polls and lets the current batch finish;
heartbeat resources are cleared when the batch completes or fails. Do not
manually clear active claims while a handler is still running.

Within one delivery attempt, handler failures returned as `success: false`
are converted to exceptions inside the relay's `withRetry` callback. The
default two retries therefore allow up to three immediate publish attempts.
Successful handlers are skipped on later attempts by the handler tracker.
Only after all immediate attempts fail does the relay increment durable
`attempts`, apply backoff, increment the durable failure counter, and possibly
transition the row to dead letter. A transient handler failure that recovers
does not affect durable failure metrics.

## Saga operations

`CheckoutSaga` and `CancellationRefundSaga` are not currently wired into the production request path. The `saga_states` table and Prisma state adapter are prepared for future orchestration.

Do not treat Saga state as active production recovery state until the payment and Saga port adapters are integrated and the Sagas are wired through the composition root.

## Projection lag

- Inspect `triad_backend_projection_lag_seconds` by projection and outbox lag together.
- If outbox lag is high, scale relay capacity or resolve the database/downstream bottleneck.
- If only one projection is lagging, inspect its handler logs and recent event payloads.
- Never rebuild by truncating a read model in production without a backup and a replay window.
- Dashboard reads `admin_dashboard_projection`, `order_history_projection` and
  `product_catalog_projection` through `PrismaDashboardReadRepository`. The
  `newUsers30Days` metric is intentionally counted from `users` because no user
  projection exists yet. If dashboard summary totals lag after product or user
  events, inspect the corresponding projection handler logs before rebuilding.

## Projection ordering policy

Projection rows use the persisted write-model revision as `sourceVersion`.
Ordering is monotonic and does not use timestamps, UUIDs, relay claim order or
`updatedAt` for correctness:

- a higher `sourceVersion` applies atomically;
- an equal `sourceVersion` is an idempotent no-op;
- a lower `sourceVersion` is a stale no-op.

Product catalog writes use the `products.version` CAS condition. Order history
uses `orders.version`; `OrderPlaced` is revision `0` and each committed status
transition carries the revision written by the optimistic-lock update. A
status event without its prerequisite placement row fails with a retryable
projection dependency error so the relay cannot silently lose it.

Rating is recomputed from authoritative reviews and is a separate derived
dimension; it does not participate in product source-version ordering. Live
rating refresh and product rebuild rating repair serialize on the catalog row
and aggregate reviews after the lock, so a stale pre-commit review snapshot
cannot overwrite a later recomputation.

## Projection rebuild procedure

Prerequisites:

1. Deploy the Prisma migration before application workers:
   `npm run prisma:migrate:deploy`.
2. Ensure the database is healthy and the application has read access to the
   write models and projection tables.

Run the online-safe rebuilds while the relay is running:

```bash
npm run projection:rebuild:orders
npm run projection:rebuild:products
```

Both commands read committed write-model versions and use the same monotonic
CAS writer as live handlers. Existing projection rows created before this
policy are migrated with `sourceVersion = -1` for both Order History and
Product Catalog, because historical Product version semantics were not
consistent. An authoritative rebuild upgrades those rows to the persisted
write-model version. Re-running either command is safe and must not regress a
newer live projection. Verify representative rows with:

```sql
SELECT "orderId", "sourceVersion" FROM "order_history_projection";
SELECT "productId", "sourceVersion" FROM "product_catalog_projection";
```

For each rebuilt row, `sourceVersion` should equal the current `orders.version`
or `products.version`. If a projection remains stale, inspect relay attempts,
handler logs and the write-model row before retrying the rebuild. Do not
truncate projection tables automatically.

Outbox rows created before version-aware payloads and lacking `sourceVersion`
are rejected by projection handlers; they are not assigned a timestamp
fallback. Drain or quarantine them according to the normal outbox failure
policy, then rebuild the affected projection from the write model before
enabling version-aware replay. Rollback is a forward migration decision: keep
the migration, stop only incompatible workers, and rebuild after the corrected
deployment.

## Database migration

Run migrations before starting application workers:

```bash
npm run prisma:migrate:deploy
```

Rollback is a forward migration decision. Stop writes only when the migration is not backward compatible; projection tables can be rebuilt from committed events.

## Incident closeout

Record the alert, first observed time, affected dependency, mitigation, replay actions and follow-up test. Add a regression test for every data-loss or duplicate-processing incident.
