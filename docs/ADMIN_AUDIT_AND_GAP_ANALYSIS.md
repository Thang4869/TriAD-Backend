# Admin Audit Log and Gap Analysis

**Repository:** `Thang4869/TriAD-Backend`
**Issue:** [#147 — Add an audit trail for sensitive administrative actions](https://github.com/Thang4869/TriAD-Backend/issues/147)
**Assessment date:** 2026-11-14
**Implementation branch:** `commit-14112026-2`

## 1. Delivered audit capability

The backend now persists `AdminAuditLog` records in `admin_audit_logs`. The
forward-only migration is
`20261114190000_admin_audit_logs/migration.sql`. Records contain actor ID and
role, controlled action, target type/ID, outcome, request ID, server timestamp,
and bounded metadata.

Audited actions:

| Action                           | Outcome coverage | Target                     |
| -------------------------------- | ---------------- | -------------------------- |
| `PRODUCT_CREATE`                 | success/failure  | Product                    |
| `PRODUCT_UPDATE`                 | success/failure  | Product                    |
| `PRODUCT_DEACTIVATE`             | success/failure  | Product                    |
| `PRODUCT_RESTORE`                | success/failure  | Product                    |
| `PRODUCT_IMAGE_UPLOAD_REQUESTED` | success/failure  | Product                    |
| `PRODUCT_IMAGE_PROCESSING`       | success/failure  | Product                    |
| `ORDER_STATUS_UPDATE`            | success/failure  | Order                      |
| `REVIEW_ADMIN_DELETE`            | success/failure  | Review                     |
| `ADMIN_ACTION_DENIED`            | denied           | Requested protected action |

Owner review deletion is intentionally not classified as an Admin action.
Read-only dashboard, product, order, and review lists are not mutation events.
No dedicated Admin user-management mutations exist in the inspected backend.

Metadata is allowlisted to changed field names, status values, queue/job
markers, bounded reason text, and error class. Passwords, hashes, tokens,
cookies, authorization headers, request/response bodies, image buffers, and
unapproved fields are not persisted.

## 2. API

`GET /api/admin/audit-logs`

- Requires authentication and the `ADMIN` role.
- Query parameters: `page` (default 1), `limit` (default 50, maximum 100),
  `actorId`, `action`, `targetType`, `targetId`, `outcome`, `from`, and `to`.
- Results are sorted deterministically by `createdAt DESC, id DESC`.
- Date filters are ISO timestamps and `from` cannot be later than `to`.
- The response uses the existing `{ success, data }` contract and includes
  `records`, `page`, `limit`, `total`, and `totalPages`.
- There is no unrestricted export endpoint. Operators should page through this
  endpoint using a short-lived Admin session and store any approved export in
  the controlled security evidence location.

Denied authenticated non-admin attempts on protected mutation routes are
recorded with fail-open behavior so an audit outage cannot turn the
authorization middleware into an availability vulnerability. Unauthenticated
requests stop at authentication and are not attributed to an actor.

## 3. Consistency and failure semantics

Business repositories retain their existing transaction boundaries. A mutation
is executed first, and a `SUCCESS` record is written only after that operation
resolves. If the operation fails, the service makes a best-effort `FAILURE`
record and rethrows the original business error. Failed-event persistence must
not mask the business error.

The audit write is currently a separate database operation from the business
transaction. This is an explicit residual consistency risk: a committed
mutation can temporarily lack its success record if the audit database is
unavailable. The request remains successful and an error is emitted through the
existing structured logger; silently claiming that the record exists is
avoided. A future transactional unit-of-work can close this gap without
changing the event contract.

Image processing carries actor and request context in the queue payload
(never the audit metadata or image buffer). The request and worker completion
are separate records sharing the request ID. A worker failure is rethrown for
the queue retry/dead-letter policy, while a post-commit audit-write failure
does not cause a successfully linked image to be processed again.

Rows are not tamper-proof or immutable. Database access controls, retention,
backup, and restricted operational access remain required controls.

## 4. Migration discrepancy and recovery

The existing migration
`20261003020000_outbox_maintenance_indexes/migration.sql` was not edited.
Raw-byte SHA-256 verification found:

- Repository file: `9a334ef024b9ce6738b47a634f69d5535173be803d07e671bb965ac14fdebe b1`
  (without the display-space typo: `...fdebe b1` is
  `...fdebeb1`).
- `_prisma_migrations.checksum`: `1a5f2fec4d4a9da667f2018f56817c95f92362a5c57df93f9a8174ad2f2cae09`.
- Both expected Outbox indexes were already present.

The evidence establishes a pre-existing migration-history metadata mismatch,
not a need to rewrite the migration. The exact historical byte sequence that
produced the stored checksum is not present in the current Git history, so the
original editing/normalization step cannot be proven from this checkout.

Safe recovery used for this change:

1. Do not edit the applied migration or `_prisma_migrations`.
2. Do not reset, push, or apply an unrelated schema diff.
3. Review a new migration containing only the missing audit table and five
   indexes.
4. Apply it with `prisma migrate deploy` to the local `triad` database.
5. Verify `prisma migrate status` reports 17 migrations up to date and inspect
   PostgreSQL indexes.

Staging/production deployment still requires an explicitly approved
environment-specific verification. If a future Prisma command rejects the old
checksum, stop and use Prisma's documented migration-recovery procedure after
DBA review; do not alter the checksum manually.

## 5. Backend gap analysis

| Priority | Finding                                                                                                       | Evidence / recommendation                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| P0       | Audit success is not in the same transaction as every business mutation.                                      | Implement a shared transaction unit-of-work or an outbox-backed audit relay before claiming strict accountability. |
| P1       | No Admin user lifecycle or role-management API was found.                                                     | Define least-privilege roles, MFA requirements, approval flow, and audit events before adding it.                  |
| P1       | No retention, archival, or restricted export automation exists.                                               | Set an approved retention period and operational ownership; keep exports bounded and access logged.                |
| P1       | Image request and worker completion are separate events.                                                      | Monitor queue retries/dead letters and alert on missing completion records.                                        |
| P2       | Order administration exposes status changes but not refund, fulfillment exception, or cancellation workflows. | Add domain-approved workflows with explicit authorization and audit coverage.                                      |
| P2       | Review moderation has deletion but no moderation reason/state model.                                          | Add reason capture and moderation states if operations require them.                                               |
| P2       | Audit query has no UI, saved filters, or operator workflow.                                                   | Add an Admin audit screen after backend contract stabilization.                                                    |
| P3       | No tamper-evident chaining or external WORM sink is configured.                                               | Consider a separate security control if the threat model requires it.                                              |

## 6. Frontend assessment (`Thang4869/TriAD-12`)

The paired repository was inspected at its current source, including
`src/modules/admin/AdminController.js`,
`src/modules/admin/AdminProductController.js`,
`src/modules/admin/AdminService.js`,
`src/modules/admin/AdminRenderer.js`, the Admin dashboard/product HTML pages,
and `src/shared/services/api.service.js`.

Observed capabilities:

- Admin dashboard, statistics, recent order listing, and order status update.
- Admin product listing, create/update, deactivate, and restore.
- Client-side role gate plus backend requests with HttpOnly-cookie credentials
  and CSRF handling.

Missing or mismatched capabilities:

- No frontend audit-log query screen or API client method.
- No review moderation screen.
- No image-upload workflow in the inspected Admin product controller.
- No Admin user-management UI.
- Frontend product payload uses a single image URL field while backend supports
  queued multipart image processing; this is an API/UI mismatch.
- Several destructive actions rely on browser `confirm` and interpolated HTML;
  add consistent confirmation, escaping, loading, empty, error, and
  permission-denied states.
- The client-side Admin gate is UX only; backend authorization remains the
  security boundary.

## 7. Verification evidence

| Check                                       | Result                                                          |
| ------------------------------------------- | --------------------------------------------------------------- |
| `npx prisma validate`                       | PASS                                                            |
| Raw migration immutability comparison       | PASS: old file unchanged                                        |
| `npx prisma migrate deploy` (local `triad`) | PASS: audit migration applied                                   |
| `npx prisma migrate status`                 | PASS: 17 migrations up to date                                  |
| PostgreSQL index inspection                 | PASS: primary key plus five indexes                             |
| Focused AuditService unit tests             | PASS: 6 tests                                                   |
| TypeScript typecheck                        | PASS                                                            |
| Full unit/integration suite (`npm test`) | PASS: 165 files, 1,633 tests |
| Full lint (`npm run lint`) | PASS |
| Production build (`npm run build`) | PASS |
| Architecture check (`npm run architecture:check`) | PASS |
| Backend API E2E scenarios | NOT EXECUTED: no dedicated backend E2E harness is configured in this checkout |
| CI | NOT EXECUTED: no remote CI run was triggered |
| Staging/production                          | BLOCKED pending explicit authorization and environment evidence |

## 8. Remaining release blockers

Issue #147 should not be described as fully production-certified until the
full existing unit/integration suites, isolated E2E scenarios, lint, build, and
CI checks are run. Strict transactionally consistent audit persistence,
retention/operational export policy, and the frontend audit UI remain follow-up
work.
