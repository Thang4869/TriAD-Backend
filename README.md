# TriAD Backend (DNEK)

**Production-oriented E-Commerce Backend**  
**Clean Architecture · Domain-Driven Design · CQRS · Reliability Engineering**

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](<>)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](<>)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748)](<>)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](<>)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D)](<>)
[![BullMQ](https://img.shields.io/badge/BullMQ-5-red)](<>)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-enabled-blue)](<>)
[![Vitest](https://img.shields.io/badge/Vitest-Coverage-green)](<>)

---

## 1. Architecture Overview

Dự án được thiết kế theo **Clean Architecture + Domain-Driven Design (DDD)** với các nguyên tắc cốt lõi:

- **Separation of Concerns** rõ ràng giữa Domain, Application, Infrastructure và Presentation.
- **Dependency Inversion** được thực thi nghiêm ngặt thông qua DI Container tùy chỉnh.
- **Domain Events + Transactional Outbox** để đảm bảo eventual consistency và reliability.
- **Idempotency**, **Optimistic Concurrency**, **Circuit Breaker**, **Rate Limiting**, **CSRF Protection**.
- **Observability** đầy đủ: Structured Logging (Winston), Metrics (Prometheus), Distributed Tracing (OpenTelemetry).

```
src/
├── core/                 # Infrastructure & Cross-cutting concerns
│   ├── di/               # Dependency Injection Container + Tokens
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
├── modules/              # Bounded Contexts (Vertical Slices)
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
├── shared/               # Shared Kernel
│   ├── domain/           # AggregateRoot, DomainEvent, DomainError
│   ├── value-objects/    # Money, Rating
│   ├── middlewares/
│   ├── utils/
│   └── constants/
├── jobs/                 # Background jobs (Email, Image Processing)
├── config/
├── app.ts
├── container.ts
└── server.ts
```

### Bounded Contexts & Aggregates

| Bounded Context | Aggregate Root  | Key Domain Concepts                      |
| --------------- | --------------- | ---------------------------------------- |
| Auth            | User            | RefreshToken family, 2FA (TOTP), OAuth   |
| Products        | Product         | Stock (optimistic locking), SearchVector |
| Cart            | Cart            | CartItem                                 |
| Checkout        | Order (pending) | Pricing, Stock Reservation, Idempotency  |
| Orders          | Order           | State Machine, PaymentStatus             |
| Reviews         | Review          | Rating Value Object                      |
| Wishlist        | WishlistItem    |                                          |
| Notifications   | Notification    |                                          |

---

## 2. Core Design Principles

### 2.1 Domain Layer (Pure & Rich)

- **Entities** và **Aggregate Roots** chứa encapsulation mạnh (`order.entity.ts`, `product.entity.ts`, `cart.entity.ts`, `user.entity.ts`).
- **Value Objects**: `Money`, `Rating` (immutable, self-validating).
- **Domain Events** được raise trong Aggregate; các event cần durable delivery sau commit được persist qua Transactional Outbox, trong khi một số notification nội bộ vẫn dùng in-process EventBus.
- **Domain Errors** thống nhất (`DomainError` hierarchy).

### 2.2 Application Layer

- Application Services / Use Cases mỏng, điều phối Domain + Infrastructure.
- Checkout transaction boundary được quản lý bởi `CheckoutUnitOfWork`; adapter `PrismaCheckoutUnitOfWork` thực thi PostgreSQL `Serializable` transaction cho stock lock/decrement, discount usage, order + items, cart cleanup và Outbox persistence.
- Idempotency Key được enforce ở middleware + service level (checkout, order placement).

### 2.3 Infrastructure Layer

- **Repository** pattern (interface ở Domain/Application, implementation ở Infrastructure).
- **Transactional Outbox** + `outbox_handler_log` cung cấp at-least-once delivery, handler success tracking và idempotent replay/recovery.
- **Circuit Breaker** (Opossum) bảo vệ external services.
- **Optimistic Concurrency Control** (`version` field trên Product & Order).

Dashboard, catalog và order history dùng query-side adapters riêng. Catalog đọc
`product_catalog_projection`, order history đọc `order_history_projection`, còn
dashboard kết hợp `admin_dashboard_projection` cho summary với hai read model
trên cho analytics. `newUsers30Days` là query hẹp trên `users` vì hiện chưa có
user projection; dashboard không fallback về write repository.

### 2.4 Cross-cutting Concerns

- Structured logging với request correlation.
- Prometheus metrics + custom business metrics.
- OpenTelemetry tracing (Jaeger / OTEL Collector).
- Rate limiting (Redis store) + strict rate limit cho auth endpoints.
- CSRF protection, Helmet, input validation (Zod).

---

## 3. Key Production Features

| Feature                | Implementation                                        | Status |
| ---------------------- | ----------------------------------------------------- | ------ |
| Transactional Outbox   | `outbox_events` + `outbox_handler_log` + Relay        | ✅     |
| Idempotency            | Redis + Idempotency-Key header + DB unique constraint | ✅     |
| Optimistic Locking     | `version` column + Prisma updateMany                  | ✅     |
| Stock Reservation      | Checkout flow với reservation service                 | ✅     |
| 2FA (TOTP)             | Speakeasy + encrypted secret                          | ✅     |
| Refresh Token Rotation | Family-based rotation + revocation                    | ✅     |
| Full-text Search       | PostgreSQL `tsvector` + GIN index                     | ✅     |
| Background Jobs        | BullMQ (Email, Image processing)                      | ✅     |
| Health Checks          | Liveness + Readiness (DB, Redis, Queue)               | ✅     |
| Observability          | Winston + Prometheus + OpenTelemetry                  | ✅     |
| Docker & Compose       | Multi-stage Dockerfile + prod compose                 | ✅     |

---

## 4. Testing Strategy

```bash
# Unit tests (fast, isolated)
npm run test:unit

# Integration tests (real DB + Redis via Testcontainers)
npm run test:integration

# Full suite
npm test
```

- **Unit tests**: Domain logic, Services, Value Objects, Middlewares (high coverage).
- **Property-based testing**: `Money`, Order state machine, Product stock (fast-check).
- **Integration tests**: Repository layer, concurrent checkout scenarios, Outbox.
- **Testcontainers** cho PostgreSQL & Redis → test gần production environment.

---

## 5. Getting Started

### Prerequisites

- Node.js ≥ 20
- Docker & Docker Compose
- PostgreSQL 16 + Redis 7 (hoặc dùng docker-compose)

### Local Development

```bash
# 1. Clone & install
git clone <repo>
cd triad-backend
npm install

# 2. Environment
cp .env.example .env
# Điền DATABASE_URL, REDIS_URL, JWT secrets, Cloudinary, OAuth credentials...

# 3. Database
npx prisma migrate dev
npm run seed

# 4. Start services
docker-compose up -d postgres redis jaeger

# 5. Run
npm run dev
```

API sẽ chạy tại `http://localhost:5000`  
Swagger (development): `http://localhost:5000/api/docs`

> `/api/docs` được tắt ở production; production API documentation nên được publish qua protected/staging docs hoặc static OpenAPI artifact.

Jaeger UI: `http://localhost:16686`

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 6. Project Structure Highlights (OOP / Clean Code)

- **DI Container** tùy chỉnh với token-based resolution (`src/core/di`).
- **Aggregate Root** base class quản lý domain events.
- **Checkout-scoped Unit of Work** (`CheckoutUnitOfWork` → `PrismaCheckoutUnitOfWork`) cho atomic checkout transaction; các module khác dùng transaction boundary phù hợp với use case thay vì một global UoW abstraction.
- **Specification** pattern trong Products (search, filter).
- **Strategy** pattern hiện được dùng cho OAuth providers; payment orchestration vẫn là extension point và chưa được production-wire với provider thật.
- **Middleware chain** rõ ràng, có request scope.
- **Mapper** được dùng tại các boundary cần thiết như Auth và Products; các module/read-model khác có thể map trực tiếp khi không cần thêm abstraction.

---

## 7. Security Checklist

- [x] Password hashing (bcrypt)
- [x] JWT Access + Refresh Token (rotation + family revocation)
- [x] 2FA (TOTP)
- [x] Rate limiting (global + auth strict)
- [x] CSRF protection
- [x] Helmet + CORS config
- [x] Input validation (Zod)
- [x] Idempotency keys
- [x] Sensitive data redaction in logs
- [x] Secure headers & cookie settings

---

## 8. Observability & Operations

- **Health**: `/health`, `/health/ready`
- **Metrics**: `/metrics` (Prometheus)
- **Tracing**: OpenTelemetry → OTEL Collector / Jaeger
- **Logging**: Winston + Daily Rotate + structured JSON
- **Outbox monitoring**: dead-letter + attempts tracking

---

## 9. Architecture Decision Records

### ADR-001: Modular Monolith trước Microservices

Các bounded context được tách bằng module, port và DI ngay trong một process. Cách này giữ transaction boundary và local debugging đơn giản khi team còn cần thay đổi domain nhanh; Outbox và Saga tạo khả năng tách service sau này mà không buộc hệ thống trả giá vận hành microservices quá sớm.

### ADR-002: Transactional Outbox + CQRS projections

Domain events được ghi cùng transaction với aggregate. Relay claim event bằng `SKIP LOCKED` và lease trước khi publish, nên nhiều instance không xử lý cùng row trong một lease. Catalog, Dashboard và Order History có dedicated projection tables được cập nhật bởi idempotent handlers. API response giữ nguyên để frontend không phải đổi hợp đồng.

### ADR-003: Prepared Saga orchestration

`CheckoutSaga` và `CancellationRefundSaga` có persisted state, retry/timeout policy, deadline và compensation semantics. Tuy nhiên production checkout hiện vẫn dùng transaction-based flow; Saga chỉ được production-wire khi payment/refund adapters và runtime integration evidence đầy đủ.

## 10. Principal Architecture

Mermaid C4 context/container/component diagrams, sequence flows, decision records, trade-offs và production commands nằm tại [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Runbook xử lý Outbox, Saga và Projection nằm tại [docs/OPERATIONS.md](docs/OPERATIONS.md).

## 11. Diagrams

### C4 Context

```mermaid
flowchart LR
	Customer[Customer / Admin] --> API[TriAD Backend API]
	API --> DB[(PostgreSQL)]
	API --> Redis[(Redis)]
	API --> External[Payment / Email / Image providers]
```

### C4 Container

```mermaid
flowchart TB
	API[Express Presentation] --> App[Application Services / CQRS]
	App --> Domain[Domain Aggregates / Value Objects]
	App --> Ports[Ports: repositories, payment, email, flags]
	Ports --> Adapters[Prisma, Redis, BullMQ, Cloudinary]
	Adapters --> DB[(PostgreSQL + Outbox)]
	DB --> Relay[Outbox Relay]
	Relay --> Bus[Event Bus / Saga Process Managers]
```

### C4 Component: Checkout

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

## 12. Reliability and Verification

- `CheckoutSaga` and `CancellationRefundSaga` have unit fault-injection tests, persisted state and compensation paths.
- Saga state machines and the PostgreSQL `saga_states` adapter are implemented, while the current production checkout path remains transaction-based until payment and Saga port adapters are integrated.
- `.github/workflows/quality-gates.yml` runs typecheck, OpenAPI contract verification, unit tests, build and the Outbox chaos probe.
- `ops/prometheus/alerts.yml` contains sample rules for outbox lag, delivery failures and stock reservation failures.
- Run `npm run typecheck`, `npm run test:unit`, and `npm run test:integration` before deployment.

Remaining production integration work is intentionally adapter-specific: a real payment provider, Saga runtime port wiring, Pact/OpenAPI consumer verification, and CI chaos jobs require the deployment environment and frontend contract. The ports and state machines keep those additions isolated from the domain.

---

## 13. License & Author

**TriAD Backend** – Public portfolio repository  
Built to demonstrate production-oriented backend architecture, reliability patterns, maintainability and scalable design practices.

> No explicit open-source license is currently included. Reuse, modification or redistribution rights are not granted unless a license is added.

---

> **Philosophy**:  
> Code is written once, read and maintained many times.  
> Domain purity, explicit boundaries, and operational excellence are non-negotiable.

```

```
