# I9 — PostgreSQL backup, restore and read-model rebuild

**Portfolio decision (2026-10-24):** the owner chose entirely free demo hosting.
[Local encrypted backup setup](PORTFOLIO_BACKUP.md) uses the owner's Windows PC,
not a paid datastore or cloud artifact quota. Full production-runtime CI passed
[run 40060645424](https://github.com/Thang4869/TriAD-Backend/actions/runs/40060645424)
in PR #227 (4,433 ms recovery, 498 ms committed-marker fixture gap). Real hosted
backup/restore and Windows scheduling remain pending owner execution. No
production RTO/RPO or persistent Free Redis guarantee is claimed.

**Status (2026-10-24):** #143 has been reopened because hosted recovery acceptance is incomplete. The existing snapshot evidence remains valid within its original scope.

**Historical baseline (2026-10-18):** The isolated PostgreSQL drill is merged and passed on `main` in [CI run #39116584480](https://github.com/Thang4869/TriAD-Backend/actions/runs/39116584480) ([restore-drill job](https://github.com/Thang4869/TriAD-Backend/actions/runs/39116584480/job/117643501456)). This proves the CI fixture only; deployed recovery evidence for issue [#143](https://github.com/Thang4869/TriAD-Backend/issues/143), including RTO/RPO, remains **OPEN**.

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

| Phase                                 |          Duration |
| ------------------------------------- | ----------------: |
| Create database and restore backup    |     1.166 seconds |
| Rebuild order and product projections |     0.933 seconds |
| API startup and HTTP verification     |     7.767 seconds |
| **Total local recovery**              | **9.866 seconds** |

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

In a _separate_ staging environment, document backup schedule, retention, encryption/key recovery, restore operator and off-host storage. Restore to a new environment, apply/reconcile migrations, rebuild projections and replay eligible outbox items safely. Verify queue consumer restart, read-only/draining cutover and sample authenticated API requests. Measure recovery **from incident declared to service healthy** (RTO) and actual time gap between last committed write and durable recovered record (RPO) with timestamps, not benchmark inference. Record rollback procedures and explicitly approve RTO/RPO targets before calling I9 CLOSED.

### Required evidence record

| Drill date (UTC)          | Deployment SHA | Backup/snapshot reference (redacted) | RTO | RPO | Projection/outbox checks | Result and artifact link   |
| ------------------------- | -------------- | ------------------------------------ | --- | --- | ------------------------ | -------------------------- |
| Pending staging execution | —              | —                                    | —   | —   | —                        | No deployed result claimed |

Capture timestamps for incident declaration, restore completion, projection readiness and first successful authenticated health/API checks. Calculate RTO from incident declaration to service healthy. Calculate RPO from the last committed write before the incident to the latest durable write present after recovery. Keep credentials, customer data and raw secrets out of the evidence artifact.

## Full production-runtime CI drill — candidate 2026-10-24

The new `.github/workflows/recovery-runtime-acceptance.yml` runs only against
owned disposable Docker resources. No Render credentials or staging account
secrets are supplied. `scripts/acceptance/recovery-runtime.sh`:

1. Builds the actual production image; starts PostgreSQL **18** (matching the
   hosted major version), Redis 7 with AOF `appendfsync=always`/`noeviction`, and
   an internal SMTP sink that discards message content and never sends email.
2. Migrates a synthetic source database and creates a verified login fixture,
   an order/idempotency/stock fixture, an explicitly dead-lettered valid
   UserRegistered event, projections, and a waiting BullMQ email job.
3. Records PostgreSQL commit timestamps for marker 1, exports `pg_dump -Fc`,
   encrypts it using AES-256-GCM, deletes the plaintext/original key and restores
   using the separately copied ephemeral escrow key. Native tests reject
   wrong keys, tampering and overwriting output without publishing plaintext.
4. Commits marker 2 after the backup, declares the simulated incident and
   restores into a clean target. Only marker 1 must be present. The observed
   fixture RPO is the actual source commit-timestamp gap between these markers;
   `track_commit_timestamp` is enabled **only on the disposable database**.
5. SIGKILLs and restarts the disposable Redis process. The AOF marker and waiting
   BullMQ job must survive. This is a process crash, not a host/power-loss test.
6. Rebuilds both projections using compiled production functions, requeues only
   the selected dead letter through the production maintenance service, then
   starts **dist/server.js**, including its real Outbox Relay and BullMQ workers.
7. Logs in through the actual HTTP API and checks authenticated order history
   plus catalog. The restored event must publish with successful handler logs;
   two real worker jobs must complete into the internal SMTP sink.
8. Gracefully drains the target, starts the preserved source on the same local
   endpoint for an authenticated rollback rehearsal, then returns to the target.
   Source post-backup marker 2 remains intact; restarting must not repeat email
   effects or alter order/stock state.

The address/token/key/dump-free `recovery-runtime-evidence` artifact records
incident-to-authenticated-worker-ready time, marker commit timestamps/loss gap,
replay/worker/persistence/API/rollback assertions and the tested SHA. The backup,
image and source services are already available at incident declaration. No
production objective is approved or inferred from this microfixture. The CI
artifact retains **evidence only**, not a usable backup or encryption key.

### Confirmed hosting blockers — 2026-10-24

Read-only inspection of My Workspace confirms:

| Resource               | Actual configuration                                | Recovery consequence                                                                                |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| triad-postgres-staging | Free, PostgreSQL 18, expires 2026-11-20             | No Render-managed backup/PITR; logical dump and a separate retention destination are not configured |
| triad-redis-staging    | Free Valkey 8.1.10, noeviction, persistenceMode=off | Queue/cache state is lost on restart; CI AOF guarantees do not apply to this instance               |
| triad-api-staging      | Free Docker, HTTP/worker/relay in one process       | Idle spin-down/restarts preclude a continuously running worker guarantee                            |

Current provider references: [Free limitations](https://render.com/docs/free),
[Postgres recovery](https://render.com/docs/postgresql-backups). Use PostgreSQL
**18** client tools for a dump of the hosted PostgreSQL 18 database; the old
PostgreSQL 16 CI drill is not a hosted export procedure.

**Owner decision:** free portfolio hosting accepted; see PORTFOLIO_BACKUP.md for
the best-effort local daily backup and manual retention/key custody. First real
backup/restore and schedule evidence are still pending. Production RTO/RPO and
hosted cutover are outside this demo acceptance.
No paid resource, schedule, secret, IP allowlist or live datastore has been
changed by this candidate. Keep #143 open even if the full-runtime CI passes.
