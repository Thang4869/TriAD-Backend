# Admin Audit & Gap Analysis

> **Repository:** `Thang4869/TriAD-Backend`  
> **Tracking issue:** [#147 — Add an audit trail for sensitive administrative actions](https://github.com/Thang4869/TriAD-Backend/issues/147)  
> **Baseline reviewed:** 2026-11-14  
> **Status:** Discovery and design in progress; no Audit Log implementation has been merged.

## 1. Purpose

This document is the working record for assessing and improving the TriAD Admin capabilities. It tracks the current state, security requirements, implementation decisions, verification evidence, and remaining work.

The work is split into two related tracks:

1. **Admin Audit Log:** establish durable, queryable records for sensitive administrative actions.
2. **Admin Gap Analysis:** compare the existing backend and frontend administration experience against the needs of an e-commerce operations team, then create prioritized implementation issues.

The audit trail is a prerequisite for safely expanding sensitive administrative capabilities. It does not, by itself, make the Admin area complete.

## 2. Working rules

- Inspect the existing architecture before introducing abstractions or dependencies.
- Reuse the existing request/correlation ID and DI patterns where appropriate.
- Record only the minimum information needed for accountability.
- Never store passwords, password hashes, access/refresh tokens, cookies, authorization headers, TOTP secrets, or unnecessary personal data in audit records.
- Distinguish **SUCCESS**, **FAILURE**, and **DENIED** outcomes; do not infer success merely because a route was invoked.
- Define and test the audit-write failure policy before claiming the audit trail is durable.
- Prefer transactionally consistent audit records for database mutations where the existing transaction boundary permits it. Explicitly document operations that cross external systems or queues.
- Do not claim immutability, tamper-proofing, or compliance guarantees unless the implementation and threat model substantiate them.
- Do not close Issue #147 until acceptance criteria and verification evidence are reviewed.
- Record commit, PR, CI, local, and staging evidence as each milestone is completed.

## 3. Initial backend baseline

The following observations were made from the repository source on the default branch at baseline commit `cb3110c6934c738a2ddab381e8ec36d6858534e4`.

| Area | Observed state | Initial assessment |
|---|---|---|
| Request correlation | `src/app.ts` already attaches a request ID to requests. | Reuse and verify propagation; do not create a competing ID mechanism. |
| Admin product operations | Admin routes expose list, create, update, soft-delete, restore, and image upload operations. | Existing sensitive mutations need audit coverage. |
| Admin order operations | Admin can list orders and update order status. | Status changes need audit coverage. |
| Review moderation | Admin can list reviews; the delete operation supports owner/Admin authorization. | Audit Admin moderation separately from ordinary owner deletion. |
| Admin dashboard | A protected statistics endpoint exists. | Read-only statistics are not mutation audit events. |
| Admin user management | No dedicated Admin mutation routes were found in the initial route review. User routes expose self-service profile/password operations. | Verify frontend and complete backend route inventory before deciding missing capabilities. |
| Audit persistence | No `AdminAuditLog` Prisma model or dedicated audit module was found in the initial search. | Persistence and application integration are not implemented at this baseline. |
| Dependency injection | Modules are registered through composition functions and `src/container.ts`; tokens are centralized. | Follow existing DI/composition conventions. |
| Domain events / transactions | Existing code uses Prisma transactions and an Outbox pattern in relevant workflows. | Inspect exact transaction boundaries before choosing the audit write strategy. |

### 3.1 Initial auditable action inventory

| Area | Action | Trigger | Notes |
|---|---|---|---|
| Products | `PRODUCT_CREATE` | Admin creates a product | Store target ID and safe change summary, not arbitrary request bodies. |
| Products | `PRODUCT_UPDATE` | Admin updates a product | Allowlist changed field names; avoid personal or secret values. |
| Products | `PRODUCT_DEACTIVATE` | Admin soft-deletes a product | Preserve the actual outcome. |
| Products | `PRODUCT_RESTORE` | Admin restores a product | Preserve the actual outcome. |
| Products | `PRODUCT_IMAGE_UPLOAD_REQUESTED` | Admin queues image processing | Distinguish accepted/queued from completed processing. |
| Orders | `ORDER_STATUS_UPDATE` | Admin changes order status | Capture safe before/after status and target order ID. |
| Reviews | `REVIEW_ADMIN_DELETE` | Admin deletes a review | Do not classify an ordinary owner deletion as an Admin action. |
| Access control | `ADMIN_ACTION_DENIED` | Authenticated non-admin attempts a protected Admin operation | Define bounded event coverage and abuse/rate-limit considerations. |

This inventory is provisional. The final event catalog must be reconciled with all routes, service methods, authorization paths, and asynchronous workers.

## 4. Audit record requirements

Proposed minimum record fields:

- Stable audit record identifier.
- Actor identifier, and actor role at the time of the action where available.
- Action name from a controlled catalog.
- Target type and target identifier.
- Timestamp generated by the persistence layer or a trusted server clock.
- Request/correlation identifier.
- Outcome: `SUCCESS`, `FAILURE`, or `DENIED`.
- Small, explicitly allowlisted metadata needed to explain the action.

Do not store complete request/response bodies, credentials, authentication material, or unrestricted entity snapshots.

## 5. Design decisions still required

These decisions must be resolved from the actual repository implementation before coding:

1. **Consistency boundary:** determine which mutations can write the audit record in the same Prisma transaction as the business change.
2. **Failure recording:** determine how to record a failed mutation when its business transaction rolls back. A write inside the rolled-back transaction cannot preserve that failure record.
3. **External/queued operations:** image upload currently queues processing. Define whether the audit event records request acceptance, worker completion, or both, and how later failures are correlated.
4. **Audit storage failure:** choose and document fail-closed versus fail-open behavior for each action class. Sensitive administrative mutations should not silently proceed without the required audit guarantee.
5. **Denied attempts:** determine which rejected requests are recorded, including authenticated non-admin attempts, without creating an unbounded log-amplification path.
6. **Query/export authorization:** define the Admin-only read path, pagination, filters, maximum export size, and protection against exposing sensitive metadata.
7. **Retention:** define retention duration, archival/deletion policy, operational ownership, and whether legal or security requirements impose a longer period.
8. **Tamper resistance:** document the actual threat model and controls; do not describe ordinary database rows as immutable.

## 6. Admin Gap Analysis

### 6.1 Backend capability inventory

| Capability | Initial finding | Follow-up |
|---|---|---|
| Dashboard statistics | Present | Review metric completeness, authorization, query performance, and operational usefulness. |
| Product administration | Basic CRUD lifecycle and image upload present | Review category/stock management, validation, bulk operations, and audit coverage. |
| Order administration | Listing and status update present | Review cancellation, refund, fulfillment, exception handling, and transition rules. |
| Review moderation | Listing and deletion present | Review moderation states, reason capture, and audit coverage. |
| User administration | No dedicated Admin mutation routes found in initial review | Inspect all routes/services and define safe user lifecycle and role-management requirements. |
| Admin audit and security | Dedicated audit module/model not found in initial review | Implement under Issue #147. |
| Reporting and exports | Not yet assessed | Inspect current APIs and business requirements before proposing endpoints. |
| System operations | Not yet assessed | Determine whether operational health belongs in Admin UI or existing observability tooling. |

### 6.2 Frontend capability inventory

**Not assessed yet.** The paired frontend repository must be reviewed before declaring which Admin screens or workflows exist or are missing.

Frontend review target: `Thang4869/TriAD-12`.

Review at minimum:
- Admin navigation and route protection.
- Dashboard screens and data visualizations.
- Product and image management workflows.
- Order management and exception workflows.
- Review moderation.
- User management.
- Audit log search/detail/export screens.
- Loading, empty, error, and permission-denied states.
- Accessibility, responsive behavior, and destructive-action confirmation.

### 6.3 Prioritization rubric

- **P0:** exploitable authorization/data-integrity issue or critical operational blocker.
- **P1:** security/accountability control or essential Admin workflow.
- **P2:** important operational capability or substantial usability gap.
- **P3:** convenience, polish, or low-risk enhancement.

No new feature issue should be created until the gap is confirmed against both backend and frontend code.

## 7. Implementation and verification roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Establish baseline and this tracking document | In progress |
| 1 | Complete route/service/transaction inspection and finalize event catalog | Pending |
| 2 | Approve audit schema, failure semantics, retention, and authorized query/export design | Pending |
| 3 | Implement persistence, application integration, authorization, and operational documentation | Pending |
| 4 | Add unit, integration, and end-to-end/security tests | Pending |
| 5 | Verify CI, local migration, and isolated staging behavior | Pending |
| 6 | Review evidence and close Issue #147 only when all criteria pass | Pending |
| 7 | Complete backend + frontend Admin Gap Analysis | Pending |
| 8 | Create prioritized Admin feature issues and implementation roadmap | Pending |

## 8. Verification evidence log

Add dated evidence here. Include exact commit/PR references and test commands/results; redact secrets and personal data.

| Date | Commit / PR | Verification | Result |
|---|---|---|---|
| 2026-11-14 | Baseline `cb3110c6934c738a2ddab381e8ec36d6858534e4` | Initial source inspection | Discovery started; implementation not yet present. |

## 9. Change log

- **2026-11-14:** Created the initial working document and recorded the first-pass backend inventory. No application code or database schema was changed.
