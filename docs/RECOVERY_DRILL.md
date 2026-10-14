# I9 — PostgreSQL backup, restore and read-model rebuild

**Status:** CI proof being implemented in [Draft PR #174](https://github.com/Thang4869/TriAD-Backend/pull/174). Does not prove deployed RTO/RPO.

## Disposable CI drill

Job: \`PostgreSQL Backup Restore Drill (I9)\`, using PostgreSQL 16 service and \`scripts/recovery-drill.sh\`.

1. Migrate isolated \`triad_recovery_source\`, create disposable fixture with user, product/stock, one persisted order (idempotency key) and one unpublished outbox intent.
2. \`pg_dump -Fc\` source; **after dump** persist a second outbox probe on source.
3. \`pg_restore\` to empty, separate \`triad_recovery_target\`, verify restored entities and idempotency key/outbox, and confirm the post-snapshot event is **absent**.
4. Rebuild order-history and product-catalog projections using existing scripts; verify sourceVersion/amount/stock and print duration evidence in GitHub Actions job summary.

The runner uses PostgreSQL **test** credentials only. Both scripts refuse execution unless \`NODE_ENV=test\`, \`RECOVERY_DRILL_ENABLED=true\`, and the database name is an explicitly approved disposable name; the shell entrypoint also checks the exact source URL. Never reuse the script with production credentials or restore into a live database.

The recorded seconds describe a small **CI fixture**, not production RTO, RPO, full PITR capability or recoverability of Redis/BullMQ. The post-backup row being absent demonstrates a snapshot boundary, not a zero-loss backup strategy.

## Production-like acceptance (still OPEN)

In a *separate* staging environment, document backup schedule, retention, encryption/key recovery, restore operator and off-host storage. Restore to a new environment, apply/reconcile migrations, rebuild projections and replay eligible outbox items safely. Verify queue consumer restart, read-only/draining cutover and sample authenticated API requests. Measure recovery **from incident declared to service healthy** (RTO) and actual time gap between last committed write and durable recovered record (RPO) with timestamps, not benchmark inference. Record rollback procedures and explicitly approve RTO/RPO targets before calling I9 CLOSED.
