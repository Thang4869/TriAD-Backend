# Operations Runbook

## First response

1. Check `/health/ready` and `/metrics`.
2. Check application logs using the request id and relevant order or outbox event id.
3. Confirm PostgreSQL and Redis connectivity before restarting workers.
4. Do not manually delete outbox rows; they are production recovery state.

## Outbox lag or dead letters

- Inspect `triad_backend_outbox_lag_seconds`, claimed/published/failed counters and `outbox_events` rows with `publishedAt IS NULL`.
- Verify the relay process is running and database connections are not exhausted.
- Check `leaseUntil`, `attempts` and `lastError`. Expired leases are safe to reclaim.
- Fix the downstream handler or dependency, then replay eligible events through the normal relay. Preserve event ids so handler idempotency remains effective.

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
