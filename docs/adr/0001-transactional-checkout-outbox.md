# ADR-0001: Transactional checkout and durable outbox before payment Saga

- **Status:** Accepted for the current COD checkout implementation
- **Recorded:** 2026-10-15
- **Context:** TriAD Backend modular monolith
- **Scope:** Checkout/order consistency and asynchronous processing

## Context

TriAD's checkout accepts COD and runs product stock/version checks,
discount usage, order/order-item creation, cart cleanup and outbox persistence
against one PostgreSQL database. The application also contains Saga
state-machine concepts, but payment/refund providers have not been integrated
into the production checkout path.

There is no evidence that splitting this write path into several independent
services currently provides more value than the consistency and operational
simplicity of one database transaction.

## Decision

Keep checkout writes behind a \`CheckoutUnitOfWork\` with PostgreSQL
\`Serializable\` isolation and an explicit retry boundary for transaction
conflicts. Re-read the locked product row before pricing/reservation, and
enforce unique user-scoped idempotency keys so that retries after a lost
client response return an existing order without decrementing stock again.

Persist necessary domain events atomically to \`outbox_events\` alongside the
corresponding aggregate changes. \`OutboxRelay\` and its handler tracker
perform asynchronous at-least-once processing, with leases, retries,
dead-letter handling and recovery tests. This does **not** guarantee
exactly-once SMTP delivery or a lag-free read model.

Do not production-wire a distributed payment/refund Saga until real
external provider adapters, settlement/refund transitions and durable
compensation behavior are tested.

## Consequences and trade-offs

- **Benefits:** enforceable single-database invariants, fewer partial-write
  states, explicit transaction boundaries and simpler operation for a
  modular monolith.
- **Costs:** potential serializable retries under contention, database
  dependence, durable outbox operation and eventual-consistency lag in
  projections.
- **Control:** scoped \`Idempotency-Key\`, stock optimistic versions, retry
  bounds, integration tests for concurrent checkouts and recovery, and
  measurable projection lag/replay evidence.
- **Not covered:** payment provider timeouts, external compensation,
  production restore RTO/RPO, or exactly-once delivery. These remain
  explicit backlog/release gates.

## Revisit when

A real payment/settlement provider is in scope, transactions begin crossing
independently committed stores, the lock/contention profile violates a
measured SLO, or migration to separate deployable services is approved with
incident response and observability support.

## Evidence

- [README — architecture and transaction boundary](../../README.md)
- [Improvement checklist](../TriAD-Backend-Improvement-Checklist.md)
- [Event durability](../EVENT_DURABILITY.md)
- [PR #161 order consistency](https://github.com/Thang4869/TriAD-Backend/pull/161)
- [PR #169 outbox kill/recovery](https://github.com/Thang4869/TriAD-Backend/pull/169)
- [PR #174 retry / price-change / restore tests](https://github.com/Thang4869/TriAD-Backend/pull/174)
