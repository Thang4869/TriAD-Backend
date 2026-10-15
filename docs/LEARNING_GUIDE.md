# Learning from TriAD Backend

TriAD is a **small independent engineering project**, not a tutorial framework or a substitute for your own design decisions. It is public under [MIT](../LICENSE) so readers can inspect, run and adapt the parts they understand.

## A suggested technical journey

| Stage | Follow these files | Engineering question to answer |
| --- | --- | --- |
| 1. HTTP boundary | [app.ts](../src/app.ts), [checkout routes](../src/modules/checkout/checkout.routes.ts) | Which inputs are validated and what happens before the domain layer? |
| 2. Application and domain | [CheckoutService](../src/modules/checkout/checkout.service.ts), [Order aggregate](../src/modules/orders/domain/order.entity.ts) | Where do business rules live, and where is an idempotency retry resolved? |
| 3. Transaction and inventory | [Prisma unit of work](../src/modules/checkout/infrastructure/prisma-checkout-unit-of-work.ts), [StockReservationService](../src/modules/checkout/services/stock-reservation.service.ts) | How does Serializable isolation prevent double spending of stock? |
| 4. Durable asynchronous work | [OutboxRelay](../src/core/outbox/outbox-relay.ts), [Event durability](EVENT_DURABILITY.md) | What survives a crash between database commit and email enqueue? |
| 5. Read models | [ProjectionHandler](../src/core/outbox/projection-handler.ts), [projection tests](../tests/integration/projection.ordering.test.ts) | Why can a list lag after checkout, and why should stale events not win? |
| 6. Operations and security | [Restore drill](RECOVERY_DRILL.md), [Threat model](THREAT_MODEL.md), [Security policy](../SECURITY.md) | Which failures are covered by CI, and which still need real staging evidence? |

## Reproduce evidence before changing code

With an isolated PostgreSQL/Redis test environment and local environment variables configured (see [README](../README.md)):

```powershell
npm ci
npx prisma generate
npm run typecheck
npm run architecture:check
npm run test:unit
npm run test:integration
npm run test:contract
npm run build
```

The integration suite uses a real database and Redis and must **not** run against deployed production data. Running CI is not equivalent to measuring actual production recovery or security.

## Three experiments worth understanding

1. **Idempotency:** run `tests/integration/checkout.recovery-consistency.test.ts`. Explain why a lost HTTP response does not imply an uncommitted order, and why the same key must not decrement stock twice.
2. **Replay ordering:** run `tests/integration/projection.ordering.test.ts`. Compare `sourceVersion` behavior with the write-side aggregate.
3. **Failure recovery:** read `tests/integration/auth.registration-process-crash.test.ts` and [Recovery Drill](RECOVERY_DRILL.md). Identify what is real (process/DB) and what is simulated (SMTP, short lease wait).

## Scope and honesty

The application currently uses a **transaction-based COD checkout**. Payment orchestration/Saga state machines are architectural preparation, not a live settlement or refund integration. Durability means recoverable work, **not** exactly-once external email delivery. Production-oriented means the repository exercises several real deployment practices; it is not a claim of compliance or a guaranteed SLA.

When sharing this repository in a CV or technical interview, prefer concrete, reproducible claims (CI jobs, tests, migrations, incident runbooks), and state which observations have not yet been measured. A meaningful software project is defined by explainable decisions and reliable behavior, not a count of libraries, patterns or pages.

## Contribute

Use [CONTRIBUTING.md](../CONTRIBUTING.md), read the [Improvement Checklist](TriAD-Backend-Improvement-Checklist.md) for real gaps, and report vulnerabilities privately following [SECURITY.md](../SECURITY.md). Preserve the [MIT copyright and permission notice](../LICENSE) on substantial redistributed portions.
