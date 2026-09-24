# Operations Runbook

## First response

1. Check `/health/ready` and `/metrics`.
2. Check application logs using the request id and saga id.
3. Confirm PostgreSQL and Redis connectivity before restarting workers.
4. Do not manually delete outbox or saga rows; both are recovery state.

## Outbox lag or dead letters

- Inspect `triad_backend_outbox_lag_seconds`, claimed/published/failed counters and `outbox_events` rows with `publishedAt IS NULL`.
- Verify the relay process is running and database connections are not exhausted.
- Check `leaseUntil`, `attempts` and `lastError`. Expired leases are safe to reclaim.
- Fix the downstream handler or dependency, then replay eligible events through the normal relay. Preserve event ids so handler idempotency remains effective.

## Saga stuck or compensating

- Find the `saga_states` row by saga id and inspect `sagaType`, `state`, `version` and `updatedAt`.
- Check the corresponding `checkout_failure_total` and `saga_compensation_total` metrics.
- A process restart is safe: persisted state resumes from the last completed step.
- If a dependency is unavailable, restore it before replaying. Compensation operations are designed to be idempotent.

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