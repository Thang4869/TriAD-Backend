# TriAD Backend (DNEK)

**Production-oriented E-Commerce Backend**  
**Clean Architecture · Domain-Driven Design · CQRS · Reliability Engineering**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![Redis](https://img.shields.io/badge/Redis-7-DC382D)
![BullMQ](https://img.shields.io/badge/BullMQ-5-red)
![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-enabled-blue)
![Vitest](https://img.shields.io/badge/Vitest-tested-green)

Backend repository: [Thang4869/TriAD-Backend](https://github.com/Thang4869/TriAD-Backend)

Frontend repository: [Thang4869/TriAD-12](https://github.com/Thang4869/TriAD-12)

---

## 1. Architecture Overview

TriAD Backend is a modular monolith designed around **Clean Architecture** and **Domain-Driven Design (DDD)**. The codebase emphasizes explicit boundaries, transactional correctness, recoverable asynchronous processing, and testable infrastructure.

Core principles:

- **Separation of Concerns** between Domain, Application, Infrastructure, and Presentation.
- **Dependency Inversion** through a custom token-based DI container.
- **Domain Events + Transactional Outbox** for side effects that require durable post-commit delivery.
- **Idempotency**, **Optimistic Concurrency**, **Circuit Breaker**, **Rate Limiting**, and **CSRF Protection**.
- **Observability** through structured logging, Prometheus metrics, and OpenTelemetry tracing.
- **CQRS-style read models** where dedicated projections materially improve query isolation and recovery.

```text
src/
├── core/                 # Infrastructure & cross-cutting concerns
│   ├── di/               # Dependency Injection container + tokens
│   ├── database/         # Prisma client
│   ├── redis/
│   ├── queue/            # BullMQ
│   ├── outbox/           # Transactional Outbox + Handler Tracker
│   ├── circuit-breaker/
│   ├── health/
│   ├── metrics/
│   ├── tracing/
│   ├── logger/
│   └── storage/          # Cloudinary
├── modules/              # Bounded contexts / vertical slices
│   ├── auth/
│   ├── users/
│   ├── products/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   ├── reviews/
│   ├── wishlist/
│   ├── notifications/
│   └── admin/
├── shared/               # Shared kernel
│   ├── domain/
│   ├── value-objects/
│   ├── middlewares/
│   ├── utils/
│   └── constants/
├── jobs/                 # Background jobs
├── config/
├── app.ts
├── container.ts
└── server.ts
```

### Bounded Contexts & Aggregates

| Bounded Context | Aggregate / Main Model | Key Domain Concepts                     |
| --------------- | ---------------------- | --------------------------------------- |
| Auth            | User                   | Refresh token family, 2FA (TOTP), OAuth |
| Products        | Product                | Stock, optimistic locking, search       |
| Cart            | Cart                   | CartItem                                |
| Checkout        | Order creation flow    | Pricing, stock reservation, idempotency |
| Orders          | Order                  | State machine, PaymentStatus            |
| Reviews         | Review                 | Rating Value Object                     |
| Wishlist        | WishlistItem           | User-product relationship               |
| Notifications   | Notification           | Delivery state / user notifications     |

---

## 2. Core Design Principles

### 2.1 Domain Layer

- **Entities** and **Aggregate Roots** encapsulate domain behavior rather than exposing data-only models.
- **Value Objects** such as `Money` and `Rating` are immutable and self-validating.
- **Domain Events** are raised from aggregates.
- Events that require durable post-commit delivery are persisted through the **Transactional Outbox**; purely in-process notifications may remain on the internal EventBus.
- Domain failures use an explicit **`DomainError` hierarchy**.

### 2.2 Application Layer

- Application services coordinate domain behavior and infrastructure ports.
- Checkout uses a dedicated **`CheckoutUnitOfWork`**.
- `PrismaCheckoutUnitOfWork` runs the checkout write path inside a PostgreSQL **`Serializable` transaction**, including stock locking/decrement, discount usage, order creation, order items, cart cleanup, and Outbox persistence.
- Idempotency is enforced at the HTTP middleware boundary and at business-critical service/database boundaries where appropriate.
- Application ports keep external systems and persistence concerns outside domain logic.

### 2.3 Infrastructure Layer

- Repository interfaces live behind application/domain-facing ports; Prisma adapters implement persistence.
- **Transactional Outbox** + `outbox_handler_log` provide at-least-once delivery, handler success tracking, retry/recovery, and idempotent replay behavior.
- **Circuit Breaker** behavior is implemented with Opossum, with retry behavior where explicitly configured.
- **Optimistic Concurrency Control** uses persisted version fields for Product and Order updates.
- Redis supports idempotency, rate limiting, queues, and token/session-related infrastructure.

### 2.4 CQRS Read Models

Dedicated query-side adapters are used where they provide a concrete benefit:

- Product catalog → `product_catalog_projection`
- Order history → `order_history_projection`
- Admin dashboard → `admin_dashboard_projection` plus dedicated read models

Projection updates use source-version-aware ordering so stale events cannot overwrite newer state. Rebuild procedures are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

### 2.5 Cross-cutting Concerns

- Structured logging with request correlation.
- Prometheus metrics and business metrics.
- OpenTelemetry tracing through the OTEL Collector / Jaeger development stack.
- Redis-backed rate limiting with stricter authentication limits.
- CSRF protection for cookie-authenticated write requests.
- Helmet, CORS configuration, cookie hardening, and Zod input validation.

---

## 3. Reliability & Platform Features

| Feature                       | Implementation                                             | Status                  |
| ----------------------------- | ---------------------------------------------------------- | ----------------------- |
| Transactional Outbox          | `outbox_events` + `outbox_handler_log` + relay             | ✅ Implemented          |
| Idempotency                   | Redis + `Idempotency-Key` + DB constraints where required  | ✅ Implemented          |
| Optimistic Locking            | Version-based conditional updates                          | ✅ Implemented          |
| Checkout transaction boundary | `CheckoutUnitOfWork` + PostgreSQL Serializable transaction | ✅ Implemented          |
| Stock protection              | Locking / version checks / retryable conflict handling     | ✅ Implemented          |
| 2FA (TOTP)                    | Speakeasy + encrypted secret                               | ✅ Implemented          |
| Refresh token rotation        | Family-based rotation + revocation                         | ✅ Implemented          |
| Full-text search              | PostgreSQL `tsvector` + GIN index                          | ✅ Implemented          |
| Background jobs               | BullMQ                                                     | ✅ Implemented          |
| Health checks                 | Liveness + readiness                                       | ✅ Implemented          |
| Observability                 | Winston + Prometheus + OpenTelemetry                       | ✅ Implemented          |
| Docker & Compose              | Multi-stage Dockerfile + dev/prod Compose                  | ✅ Implemented          |
| Payment provider integration  | Provider port / extension point                            | ⏳ Not production-wired |
| Saga runtime orchestration    | State machines + persistence prepared                      | ⏳ Not production-wired |

---

## 4. Testing Strategy

```bash
# Type checking
npm run typecheck

# Lint
npm run lint

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Full suite
npm test

# Production build
npm run build
```

Coverage and reliability strategy includes:

- **Unit tests** for domain logic, services, value objects, and middleware.
- **Property-based tests** for invariants such as Money, order state transitions, and stock behavior.
- **Integration tests** with real PostgreSQL and Redis through Testcontainers.
- **Concurrency tests** around checkout, optimistic conflicts, and Outbox claims.
- **Outbox recovery tests** covering retries, handler tracking, replay, crash windows, and dead-letter behavior.
- **Projection ordering/rebuild tests** using persisted source versions.
- **Redis idempotency integration tests** for in-progress claims, TTL, completed replay, and payload mismatch rejection.

---

## 5. Getting Started

### Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose
- Git

### 5.1 Backend Local Development

```bash
git clone https://github.com/Thang4869/TriAD-Backend.git
cd TriAD-Backend
npm install
```

Create the local environment file:

```bash
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

The provided development baseline expects:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/triad?schema=public
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
```

Replace the example JWT/TOTP secrets before using the environment for anything beyond local development.

Start infrastructure:

```bash
docker compose up -d postgres redis jaeger
```

Run database migrations and seed data:

```bash
npm run prisma:migrate
npm run seed
```

Start the backend:

```bash
npm run dev
```

Development endpoints:

- API: `http://localhost:5000`
- Swagger UI: `http://localhost:5000/api/docs`
- Health: `http://localhost:5000/health`
- Liveness: `http://localhost:5000/health/live`
- Readiness: `http://localhost:5000/health/ready`
- Metrics: `http://localhost:5000/metrics`
- Jaeger UI: `http://localhost:16686`

> `/api/docs` and `/metrics` are not mounted by the application in production.

### 5.2 Frontend Integration

Run the frontend in a separate terminal:

```bash
git clone https://github.com/Thang4869/TriAD-12.git
cd TriAD-12
npm install
npm run dev
```

The frontend development server runs at:

```text
http://localhost:3000
```

During local development, Vite proxies:

```text
/api/* -> http://localhost:5000
```

This allows frontend code to call `/api/...` while Vite forwards the request to the backend.

The local development flow is:

1. Start PostgreSQL, Redis, and Jaeger.
2. Run backend migrations and seed data.
3. Start the backend with `npm run dev`.
4. Start the frontend with `npm run dev`.
5. Open `http://localhost:3000`.

For production frontend deployment, configure the frontend API base URL for the deployed backend rather than relying on the local Vite proxy.

### 5.3 Production Compose

Production deployment requires the variables expected by `docker-compose.prod.yml`, including database, Redis, JWT/TOTP, frontend/CORS, SMTP, and Cloudinary configuration.

Validate configuration first:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

Then build and start:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Run production migrations as an explicit deployment step:

```bash
npm run prisma:migrate:deploy
```

Operational procedures for Outbox replay, cleanup, projection rebuilds, incident handling, and recovery are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

---

## 6. Project Structure Highlights

- **Custom DI Container** with token-based resolution and explicit lifetimes.
- **Aggregate Root** base abstraction for domain events.
- **Checkout-scoped Unit of Work** rather than a misleading global UoW abstraction.
- **Specification Pattern** for Product catalog filtering/search.
- **Strategy Pattern** for OAuth providers.
- **Mapper abstractions** only at boundaries where mapping adds value.
- **Repository / Port-Adapter boundaries** for persistence and external services.
- **Middleware chain** for request scope, authentication, CSRF, idempotency, logging, metrics, validation, and error translation.

Payment orchestration remains an extension point; a real payment/refund provider is not production-wired yet.

---

## 7. Security

- [x] Password hashing with bcrypt
- [x] JWT access + refresh token flow
- [x] Refresh token rotation and family revocation
- [x] 2FA (TOTP)
- [x] Authentication rate limiting
- [x] Redis-backed global/API rate limiting
- [x] CSRF protection
- [x] Helmet security headers
- [x] CORS configuration
- [x] Zod input validation
- [x] Idempotency keys for critical write flows
- [x] Sensitive-data redaction in logs
- [x] Secure cookie configuration
- [x] Production Swagger/metrics exposure disabled by application routing

Deployed cross-origin authentication still requires environment-specific verification on the actual frontend/backend domains.

---

## 8. Observability & Operations

### Health

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

Readiness checks infrastructure dependencies and returns `503` when the application is not ready to serve traffic.

### Metrics

Prometheus-compatible metrics are exposed through `/metrics` outside production. Production metrics exposure should be handled through an explicitly protected/internal deployment path rather than a public endpoint.

### Tracing

OpenTelemetry tracing is initialized by the application and can export through the OTEL Collector. The development Compose stack includes Jaeger for local inspection.

### Logging

Winston provides structured logging and request correlation. Runtime failures in queue, Outbox, persistence, and HTTP boundaries are logged with contextual metadata.

### Outbox Operations

The Outbox implementation includes:

- row claiming with lease semantics,
- handler success tracking,
- retry/backoff,
- dead-letter handling,
- replay tooling,
- cleanup tooling,
- observability metrics,
- crash-window recovery behavior.

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

---

## 9. Architecture Decision Records

### ADR-001: Modular Monolith Before Microservices

Bounded contexts are separated by modules, ports, and DI while remaining in one deployable application process.

This keeps transaction boundaries, debugging, and local development simpler while the domain continues to evolve. Outbox-backed asynchronous boundaries make later extraction possible without paying the operational cost of microservices prematurely.

### ADR-002: Transactional Outbox + CQRS Projections

Events that require durable post-commit processing are written in the same database transaction as the associated state change.

The Outbox relay claims rows with PostgreSQL locking/lease semantics before dispatch. Dedicated projections support catalog, dashboard, and order-history read paths. Handlers and projection writers are designed to tolerate retry/replay.

### ADR-003: Prepared Saga Orchestration

`CheckoutSaga` and `CancellationRefundSaga` include persisted state, retry/timeout behavior, deadlines, and compensation semantics.

They are **not the current production checkout path**. Production checkout remains transaction-based. Saga orchestration should only be wired into the runtime after payment/refund adapters and end-to-end failure semantics are proven.

---

## 10. Principal Architecture

Detailed Mermaid diagrams, architectural decisions, transaction boundaries, and trade-offs are documented in:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)

The current runtime topology intentionally runs the HTTP server, BullMQ workers, and OutboxRelay in the same application process. Separate worker processes should be introduced only when scaling, deployment isolation, resource isolation, or failure isolation requirements justify the added operational complexity.

---

## 11. Diagrams

### 11.1 System Context

```mermaid
flowchart LR
    User[Customer / Admin] --> FE[TriAD Frontend]
    FE --> API[TriAD Backend API]

    API --> DB[(PostgreSQL)]
    API --> Redis[(Redis)]
    API --> Email[Email Provider]
    API --> Images[Cloudinary]

    API -. future payment adapter .-> Payment[Payment Provider]
```

### 11.2 Backend Container View

```mermaid
flowchart TB
    HTTP[Express Presentation] --> App[Application Services / CQRS]
    App --> Domain[Domain Aggregates / Value Objects]
    App --> Ports[Application Ports]

    Ports --> Prisma[Prisma Adapters]
    Ports --> RedisAdapter[Redis / BullMQ]
    Ports --> External[Email / Image Adapters]

    Prisma --> DB[(PostgreSQL + Outbox)]
    DB --> Relay[Outbox Relay]
    Relay --> EventBus[Event Bus / Projection Handlers]

    Saga[Prepared Saga State Machines] -. not production-wired .-> App
    Payment[Future Payment Adapter] -. extension point .-> Ports
```

### 11.3 Current Production Checkout

```mermaid
flowchart TD
    Request[Checkout Request] --> Idempotency[Idempotency Validation]
    Idempotency --> UoW[CheckoutUnitOfWork]
    UoW --> Tx[PostgreSQL Serializable Transaction]

    Tx --> Lock[Lock / Validate Stock]
    Lock --> Pricing[Pricing / Discount Validation]
    Pricing --> Order[Create Order + Items]
    Order --> Stock[Decrement Stock]
    Stock --> Outbox[Persist Durable Domain Events]
    Outbox --> Cart[Clear Cart]
    Cart --> Commit[Commit]

    Commit --> Response[Checkout Response]
```

### 11.4 Prepared Saga State Model

The following models future distributed payment orchestration; it is **not** the currently wired production checkout path.

```mermaid
stateDiagram-v2
    [*] --> StockReserved
    StockReserved --> OrderPlaced
    OrderPlaced --> PaymentAuthorized
    PaymentAuthorized --> Completed

    StockReserved --> Compensated: failure
    OrderPlaced --> Compensated: failure
    PaymentAuthorized --> Compensated: failure
```

---

## 12. Reliability & Verification

Implemented reliability evidence includes:

- Checkout concurrency and conflict handling.
- PostgreSQL Serializable transaction boundaries.
- Idempotency replay and payload-mismatch protection.
- Redis-backed idempotency integration tests.
- Outbox retry, lease, handler-tracker, crash-window, replay, and dead-letter behavior.
- Source-version-aware projection ordering and rebuild procedures.
- Unit fault-injection tests for prepared Saga state machines.
- OpenAPI contract verification.
- Architecture boundary checks.
- Typecheck, lint, build, unit, integration, and broader quality-gate coverage.

Before deployment, run at minimum:

```bash
npm run typecheck
npm run lint
npm run architecture:check
npm run test:unit
npm run test:integration
npm run build
```

Current limitations are explicit:

- No real payment/refund provider is production-wired.
- Prepared Saga orchestration is not the active production checkout path.
- Cross-domain production CSRF/CORS/OAuth behavior still requires smoke verification on the deployed frontend/backend domains.
- Full frontend-to-backend CI journey and production-image runtime smoke/recovery evidence remain separate operational backlog items where not yet completed.

---

## 13. License & Portfolio Use

**TriAD Backend** is a public portfolio repository built to demonstrate production-oriented backend architecture, reliability patterns, maintainability, and scalable design practices.

No explicit open-source license is currently included. Reuse, modification, or redistribution rights are therefore not granted unless a license is added.

---

> **Philosophy**
>
> Code is written once, read and maintained many times.
>
> Domain purity, explicit boundaries, and operational reliability should be demonstrated by code and evidence, not by labels alone.
