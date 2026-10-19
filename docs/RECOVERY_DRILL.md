# I9 — PostgreSQL backup, restore and read-model rebuild

**Status (2026-10-18):** The isolated PostgreSQL drill is merged and passed on `main` in [CI run #39116584480](https://github.com/Thang4869/TriAD-Backend/actions/runs/39116584480) ([restore-drill job](https://github.com/Thang4869/TriAD-Backend/actions/runs/39116584480/job/117643501456)). This proves the CI fixture only; deployed recovery evidence for issue [#143](https://github.com/Thang4869/TriAD-Backend/issues/143), including RTO/RPO, remains **OPEN**.

## Disposable CI drill

Job: \`PostgreSQL Backup Restore Drill (I9)\`, using PostgreSQL 16 service and \`scripts/recovery-drill.sh\`.

1. Migrate isolated \`triad_recovery_source\`, create disposable fixture with user, product/stock, one persisted order (idempotency key) and one unpublished outbox intent.
2. \`pg_dump -Fc\` source; **after dump** persist a second outbox probe on source.
3. \`pg_restore\` to empty, separate \`triad_recovery_target\`, verify restored entities and idempotency key/outbox, and confirm the post-snapshot event is **absent**.
4. Rebuild order-history and product-catalog projections using existing scripts; verify sourceVersion/amount/stock and print duration evidence in GitHub Actions job summary.

The runner uses PostgreSQL **test** credentials only. Both scripts refuse execution unless \`NODE_ENV=test\`, \`RECOVERY_DRILL_ENABLED=true\`, and the database name is an explicitly approved disposable name; the shell entrypoint also checks the exact source URL. Never reuse the script with production credentials or restore into a live database.

The recorded seconds describe a small **CI fixture**, not production RTO, RPO, full PITR capability or recoverability of Redis/BullMQ. The post-backup row being absent demonstrates a snapshot boundary, not a zero-loss backup strategy.

## Local recovery acceptance — 2026-10-19

**Status: LOCAL PASS / DEPLOYED ACCEPTANCE OPEN**

- Git revision: `3f4ad02`
- Environment: isolated Docker Desktop recovery containers
- PostgreSQL backup/restore and source-data consistency: PASS
- Snapshot boundary: PASS; post-backup outbox event absent
- Dead-letter outbox replay: PASS (isolated database)
- Redis AOF persistence across clean restart: PASS
- Order History Projection rebuild: PASS (1 order)
- Product Catalog Projection rebuild: PASS (1 product)
- Recovery HTTP `/health/live`: 200
- Recovery HTTP `/health/ready`: 200
- Recovery HTTP `/api/products`: 200; fixture `i9-restore-product` found

### Continuous local recovery timing

| Phase | Duration |
| --- | ---: |
| Create database and restore backup | 1.166 seconds |
| Rebuild order and product projections | 0.933 seconds |
| API startup and HTTP verification | 7.767 seconds |
| **Total local recovery** | **9.866 seconds** |

The timer started before database creation and stopped after
successful HTTP health and product verification.

**Measurement scope:** PostgreSQL and Redis were already running.
The verified backup and Docker image were already available.
A recovery-specific HTTP entrypoint was used without starting
BullMQ workers or Outbox Relay.

This is a local recovery benchmark, **not a production RTO guarantee**.

### Outstanding acceptance requirements

- Define and verify the PostgreSQL backup schedule and retention.
- Verify off-host storage, encryption and key recovery.
- Define approved RTO/RPO targets.
- Measure actual RPO using timestamped committed/recovered writes.
- Test full background-worker recovery and relevant external integrations.
- Test authenticated API requests and safe cutover/rollback.
- Record separate staging/deployment recovery evidence.

**Issue #143 remains OPEN** until the required acceptance criteria
are satisfied. The snapshot boundary test does not establish actual RPO.

---

## Production-like acceptance (still OPEN)

In a *separate* staging environment, document backup schedule, retention, encryption/key recovery, restore operator and off-host storage. Restore to a new environment, apply/reconcile migrations, rebuild projections and replay eligible outbox items safely. Verify queue consumer restart, read-only/draining cutover and sample authenticated API requests. Measure recovery **from incident declared to service healthy** (RTO) and actual time gap between last committed write and durable recovered record (RPO) with timestamps, not benchmark inference. Record rollback procedures and explicitly approve RTO/RPO targets before calling I9 CLOSED.

### Required evidence record

| Drill date (UTC) | Deployment SHA | Backup/snapshot reference (redacted) | RTO | RPO | Projection/outbox checks | Result and artifact link |
| --- | --- | --- | --- | --- | --- | --- |
| Pending staging execution | — | — | — | — | — | No deployed result claimed |

Capture timestamps for incident declaration, restore completion, projection readiness and first successful authenticated health/API checks. Calculate RTO from incident declaration to service healthy. Calculate RPO from the last committed write before the incident to the latest durable write present after recovery. Keep credentials, customer data and raw secrets out of the evidence artifact.
