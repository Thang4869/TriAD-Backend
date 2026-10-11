# Event durability policy — TriAD Backend

**Reviewed:** 2026-10-10  
**Scope:** Auth and Reviews; production event relay + downstream projections.  
**Status:** Implementation prepared from the 2026-10-09 export; mark validated only after CI/integration tests run in the repository.

## Classification matrix

| Signal / side effect                                                   | Producer & consumer                                                                       | Reliability / idempotency decision                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserRegistered` → dashboard projection                                | Password registration and new OAuth identity; `DashboardProjectionHandler:UserRegistered` | **Durable**: the new user, cart and outbox event commit in one PostgreSQL transaction. Outbox relay retries after process restart. `(outboxEventId, handlerName)` tracked by `PrismaOutboxHandlerTracker`; dashboard recomputation is idempotent.                                                                                    |
| `ReviewCreated` / `ReviewDeleted` → product rating projection          | `PrismaReviewsRepository`; `ProductCatalogRatingProjectionHandler:<eventName>`            | **Durable (already implemented)**: review mutation and outbox commit together. Handler recomputes rating and has per-event/per-handler completion tracking. If outbox write fails, transaction rolls back.                                                                                                                           |
| `UserEmailVerified`                                                    | `User.verify()` emits internally; no subscribed handler in `wire-domain-events.ts`        | **Local only**: no downstream side effect currently. Not persisted or published. If a consumer is introduced, reassess durability together with the user update transaction.                                                                                                                                                         |
| `UserPasswordChanged`, `UserTwoFactorEnabled`, `UserTwoFactorDisabled` | Domain event types exist; no subscribed handler                                           | **Not currently dispatched** from AuthService. No outbox required for an unconsumed event; introducing security notifications/audit consumers requires a separate reliable delivery design.                                                                                                                                          |
| Account verification email job                                         | `AuthService.sendVerificationEmail()` → `EmailService` → BullMQ                           | **Post-commit, not atomic with DB**. BullMQ retries accepted jobs, but a crash/Redis outage between the DB commit and enqueue can lose the initial notification. Users can request `resendVerificationEmail`; it generates another token. This is an explicit **remaining gap**; do not claim atomic delivery of verification email. |

## Failure handling and crash windows

- Outbox persistence failure: fail the transaction; no user/cart/review mutation is committed. No success response should be reported.
- PostgreSQL commit succeeds, relay crashes before processing: pending row remains in the outbox and is retried by relay with leases, backoff and dead-letter rules.
- Handler fails after its side effect but before tracking success: duplicate invocation is possible. Consumers must remain idempotent; dashboard refresh and rating recalculation overwrite computed state.
- New OAuth account: existing linked identity or repeated callback returns `created: false`; it does **not** add another `UserRegistered` outbox row. Unique provider/subject in DB guards concurrent creates.
- Verification email Redis/BullMQ enqueue fails: `AuthService.register()` can return an error **after** the user is committed. The account may still exist and the user should use resend; retrying register may yield `Email already registered`. A recovery/outbox-backed email design remains open.
- `UserEmailVerified` has no subscriber, therefore intentionally not put into outbox. If audit/security consumers are implemented, address durability before subscribing.

## Reproducible evidence / release gate

1. `npm run typecheck`, `npm run lint`, `npm run architecture:check`.
2. `npm run test:unit -- tests/unit/modules/auth/auth.service.test.ts tests/unit/jobs/email.job.test.ts`.
3. `npm run test:integration -- tests/integration/auth.repository.test.ts tests/integration/reviews.repository.test.ts` (Postgres/Redis/Testcontainers available).
4. Verify rollback injection for password and OAuth registrations, single event on repeated OAuth callback, existing Reviews transactional tests.
5. Run an outbox relay restart/crash-window scenario before claiming end-to-end crash recovery in production.

**Next:** B2+B3 JWT/token-class hardening; independently prioritize verification-email post-commit delivery gap if email reliability is a production requirement.
