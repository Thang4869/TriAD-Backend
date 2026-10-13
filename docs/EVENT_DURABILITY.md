# Event durability policy — TriAD Backend

**Reviewed:** 2026-10-13  
**Scope:** Auth and Reviews; production event relay + downstream projections.  
**Status:** Initial verification email now follows the transactional `UserRegistered` outbox path on branch `commit-13102026`; CI/runtime recovery proof pending. This is an at-least-once handoff, not guaranteed SMTP delivery.

## Classification matrix

| Signal / side effect                                                   | Producer & consumer                                                                       | Reliability / idempotency decision                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserRegistered` → dashboard projection                                | Password registration and new OAuth identity; `DashboardProjectionHandler:UserRegistered` | **Durable**: the new user, cart and outbox event commit in one PostgreSQL transaction. Outbox relay retries after process restart. `(outboxEventId, handlerName)` tracked by `PrismaOutboxHandlerTracker`; dashboard recomputation is idempotent.                                                                                    |
| `ReviewCreated` / `ReviewDeleted` → product rating projection          | `PrismaReviewsRepository`; `ProductCatalogRatingProjectionHandler:<eventName>`            | **Durable (already implemented)**: review mutation and outbox commit together. Handler recomputes rating and has per-event/per-handler completion tracking. If outbox write fails, transaction rolls back.                                                                                                                           |
| `UserEmailVerified`                                                    | `User.verify()` emits internally; no subscribed handler in `wire-domain-events.ts`        | **Local only**: no downstream side effect currently. Not persisted or published. If a consumer is introduced, reassess durability together with the user update transaction.                                                                                                                                                         |
| `UserPasswordChanged`, `UserTwoFactorEnabled`, `UserTwoFactorDisabled` | Domain event types exist; no subscribed handler                                           | **Not currently dispatched** from AuthService. No outbox required for an unconsumed event; introducing security notifications/audit consumers requires a separate reliable delivery design.                                                                                                                                          |
| Initial account verification email | `UserRegistered` transactional outbox → `RegistrationVerificationHandler` → Redis token + BullMQ `EmailService` | **Durable enqueue intent (pending CI)**: user/cart/event commit together; dispatcher retries after Redis/queue failure. Event-derived HMAC token and stable BullMQ job ID support replay. Provider delivery is at-least-once and can still fail; BullMQ retries are finite. |

## Failure handling and crash windows

- Outbox persistence failure: fail the transaction; no user/cart/review mutation is committed. No success response should be reported.
- PostgreSQL commit succeeds, relay crashes before processing: pending row remains in the outbox and is retried by relay with leases, backoff and dead-letter rules.
- Handler fails after its side effect but before tracking success: duplicate invocation is possible. Consumers must remain idempotent; dashboard refresh and rating recalculation overwrite computed state.
- New OAuth account: existing linked identity or repeated callback returns `created: false`; it does **not** add another `UserRegistered` outbox row. Unique provider/subject in DB guards concurrent creates.
- Initial verification email Redis/BullMQ enqueue fails: `UserRegistered` outbox row stays unpublished or retries until success/dead-letter, while registration can return success after the PostgreSQL commit. The user can use `resendVerificationEmail` if processing is delayed.
- Replay uses the same HMAC-SHA256 verification token derived from `(userId, UserRegistered.occurredAt)` and a stable BullMQ job ID. Secrets/tokens are not stored in outbox payload. An existing verified user is skipped.
- Sending SMTP mail is **not** atomic with BullMQ completion. Repeated emails can still occur after a job timeout/crash or after the BullMQ dedupe retention window. Dead-letter alerting/manual replay must be operationalized; no exactly-once email claim.
- Manual `resendVerificationEmail` still generates a new random token and enqueues directly; this endpoint remains best-effort and its Redis enqueue failure can surface to the caller. A durable resend design is a separate follow-up.
- `UserEmailVerified` has no subscriber, therefore intentionally not put into outbox. If audit/security consumers are implemented, address durability before subscribing.

## Reproducible evidence / release gate

1. `npm run typecheck`, `npm run lint`, `npm run architecture:check`.
2. `npm run test:unit -- tests/unit/modules/auth/auth.service.test.ts tests/unit/modules/auth/registration-verification.handler.test.ts tests/unit/core/di/domain-event-wiring.test.ts tests/unit/jobs/email.job.test.ts`.
3. `npm run test:integration -- tests/integration/auth.repository.test.ts tests/integration/reviews.repository.test.ts` (Postgres/Redis/Testcontainers available).
4. Verify rollback injection for password and OAuth registrations, single event on repeated OAuth callback, existing Reviews transactional tests.
5. Integration: `tests/integration/auth.repository.test.ts` replays committed `UserRegistered` event after simulated queue error with a stable token/job ID. CI PASS still required.
6. Run an actual outbox relay restart/kill-process and SMTP/Redis outage scenario before claiming crash recovery or an email delivery SLO.

**Next:** verify the new handler/DI/relay path in CI; run actual crash/recovery tests and review BullMQ job retention + alerting. A1 remains PARTIAL until this evidence exists.
