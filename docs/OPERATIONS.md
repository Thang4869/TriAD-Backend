# Operations Runbook

## First response

1. Check `/health/ready` and `/metrics`.
2. Check application logs using the request id and relevant order or outbox event id.
3. Confirm PostgreSQL and Redis connectivity before restarting workers.
4. Do not manually delete outbox rows; they are production recovery state.

## Outbox lag or dead letters

- Inspect `triad_backend_outbox_lag_seconds`, `triad_backend_outbox_dead_lettered_events`, claimed/published/failed counters and `outbox_events` rows with `publishedAt IS NULL`.
- Verify the relay process is running and database connections are not exhausted.
- Check `leaseUntil`, `attempts` and `lastError`. Expired leases are safe to reclaim.
- Fix the downstream handler or dependency, then replay eligible events through the normal relay. Preserve event ids so handler idempotency remains effective.

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
