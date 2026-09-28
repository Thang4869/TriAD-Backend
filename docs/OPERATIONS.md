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

## Database migration

Run migrations before starting application workers:

```bash
npm run prisma:migrate:deploy
```

Rollback is a forward migration decision. Stop writes only when the migration is not backward compatible; projection tables can be rebuilt from committed events.

## Incident closeout

Record the alert, first observed time, affected dependency, mitigation, replay actions and follow-up test. Add a regression test for every data-loss or duplicate-processing incident.
