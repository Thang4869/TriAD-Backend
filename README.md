# DNEK — TriAD E-Commerce Backend API

**TriAD E-Commerce Backend API** — a modular Node.js/TypeScript REST API for a kitchenware e-commerce platform.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-orange)](https://docs.bullmq.io/)
[![Vitest](https://img.shields.io/badge/Vitest-4.x-6E9F18)](https://vitest.dev/)

**Version:** 1.0.0 (from `package.json`)

---

## Overview

This backend provides the API layer for **TriAD**, an e-commerce platform focused on kitchenware (glass storage containers and related products). It handles user authentication (including OAuth and TOTP 2FA), product catalog management, shopping cart, checkout with stock consistency controls, orders, reviews, and notifications.

The application is a **modular Express.js backend** with clear separation between routes, controllers, services, and repositories. It uses Prisma as the ORM against PostgreSQL, Redis for caching/sessions/blacklists/idempotency, and BullMQ for background email and image-processing jobs. Configuration is validated at startup with Zod. Logging uses Winston with daily rotation. API documentation is available via Swagger UI.

---

## Features

### Authentication & Identity

- User registration with email verification (token stored in Redis, 15-minute TTL)
- Login with bcrypt password verification
- JWT access tokens (default 15m) + refresh tokens (default 7d) stored in DB
- Refresh token rotation and invalidation
- Logout with access-token blacklist (Redis) and refresh-token deletion
- TOTP-based 2FA (enable / verify / login challenge) using `speakeasy`
- Google OAuth 2.0 and Facebook OAuth (Passport strategies)
- HTTP-only cookies for tokens (secure flag in production)
- Resend verification email

### E-Commerce Domain

- **Users**: profile retrieval/update, password change
- **Products**: public listing with filters (category, price range, keyword, sort), slug/ID lookup, categories with counts; admin CRUD (create/update/soft-delete/restore) with slug uniqueness checks
- **Cart**: get/create cart, add/update/remove items, clear cart; stock checks on mutation
- **Checkout**: place order with payment method (COD / CARD / BANKING), address, phone, optional notes/discount; idempotency key support; concurrent-stock protection (tested)
- **Orders**: list and retrieve user orders
- **Reviews**: create (one per user/product), list by product, delete (owner or admin), admin list-all
- **Notifications**: basic notification endpoints (authenticated)

### Security

- Helmet (CSP, HSTS, frameguard, noSniff, XSS filter)
- Configurable CORS with credentials
- JWT Bearer authentication + optional auth middleware
- Role-based access control (`USER` / `ADMIN`) via middleware
- Zod request validation on DTOs
- Rate limiting (Redis-backed) — global + stricter auth limiter
- Idempotency middleware for mutating requests (Redis)
- Sensitive field redaction in request logs
- Centralized error handling (Prisma, Zod, JWT, operational errors)

### Reliability & Data Integrity

- Prisma transactions used in critical paths (e.g. seed, checkout concurrency test)
- Optimistic concurrency field (`version`) on products (visible in concurrency test)
- Refresh-token expiry checks and bulk invalidation
- Redis health check and connection retry
- Graceful shutdown (HTTP server close → Prisma disconnect → Redis quit) with 10 s force-exit timeout
- Database connection verification on startup

### Background Processing

- BullMQ queues: `email` (3 attempts, exponential backoff, concurrency 5) and `image` (2 attempts, fixed delay, concurrency 2)
- Email job: Nodemailer-based templates (welcome, order-confirmation, verify-email)
- Image job: Sharp resize/JPEG conversion and local filesystem save under `uploads/products`
- Queue event logging (completed / failed)

### Observability

- Winston logger: console (colorized) + daily-rotate file (`triad-%DATE%.log`, 20 MB max, 14-day retention)
- Request/response logging middleware with duration and request ID
- Correlation / request ID headers
- Exception and rejection handlers

---

## Technology Stack

| Category         | Technology                  | Notes / Version                |
| ---------------- | --------------------------- | ------------------------------ |
| Runtime          | Node.js                     | ES2022 target                  |
| Language         | TypeScript                  | ^5.3.3                         |
| HTTP Framework   | Express.js                  | ^4.18.2                        |
| ORM              | Prisma                      | ^5.22.0                        |
| Database         | PostgreSQL                  | 16 (Docker)                    |
| Cache / Queue    | Redis + BullMQ              | Redis 7, BullMQ ^5.1.8         |
| Auth             | JWT, Passport, OAuth2       | passport-jwt, Google, Facebook |
| Password Hashing | bcrypt                      | ^5.1.1                         |
| Validation       | Zod                         | ^3.22.4                        |
| API Docs         | Swagger / OpenAPI 3.0       | swagger-jsdoc + UI             |
| Logging          | Winston + daily-rotate-file | ^3.11.0 / ^4.7.1               |
| Email            | Nodemailer                  | ^9.0.5                         |
| Image Processing | Sharp                       | ^0.35.3                        |
| Testing          | Vitest                      | ^4.1.11                        |
| Containerization | Docker / Docker Compose     | multi-stage Dockerfile         |

---

## Architecture

The codebase follows a **modular Express structure** with service/repository separation and shared infrastructure. It is **not** Clean Architecture, Hexagonal, DDD, or microservices.

```text
src/
├── config/                 # Zod-validated env config + Swagger options
├── core/
│   ├── database/           # Prisma client singleton
│   ├── logger/             # Winston setup
│   ├── queue/              # BullMQ queues & workers
│   └── redis/              # ioredis client
├── jobs/                   # Email & image processing handlers
├── modules/
│   ├── auth/               # Auth (DTO, strategies, controller, service, repo, routes)
│   ├── cart/
│   ├── checkout/
│   ├── notifications/
│   ├── orders/
│   ├── products/
│   ├── reviews/
│   └── users/
├── shared/
│   ├── middlewares/        # auth, error, idempotency, logger, rate-limit, rbac, validation
│   ├── services/           # EmailService helper
│   ├── types/              # Express augmentation, Role type
│   └── utils/              # bcrypt, errors, idempotency, jwt, totp helpers
├── app.ts                  # Express app assembly, middleware, route mounting
└── server.ts               # Bootstrap, health checks, graceful shutdown
```

- **Routes** declare HTTP methods, validation, auth/RBAC middleware, and Swagger JSDoc.
- **Controllers** extract request data, call services, shape JSON responses.
- **Services** contain business logic and orchestrate repositories / Redis / queues.
- **Repositories** encapsulate Prisma queries (interfaces + Prisma implementations).
- **DTOs** are Zod schemas for body/query/params.
- **Core** provides infrastructure singletons.
- **Jobs** are the actual worker processors registered with BullMQ.

---

## Request Lifecycle

```mermaid
flowchart LR
  Client --> Express
  Express --> Helmet/CORS/Compression/Logger
  Express --> RateLimiter
  Express --> CookieParser/JSON
  Express --> Routes
  Routes --> Auth/RBAC/Validation/Idempotency
  Routes --> Controller
  Controller --> Service
  Service --> Repository
  Repository --> Prisma
  Prisma --> PostgreSQL
  Service --> Redis
  Service --> BullMQ
  BullMQ --> Workers
```

---

## Authentication Flow

```mermaid
flowchart TD
  A[Register] --> B[Hash password bcrypt]
  B --> C[Create User + Cart]
  C --> D[Generate verification token → Redis]
  D --> E[Enqueue verification email]
  E --> F[User clicks link]
  F --> G[Verify token → set isVerified]
  G --> H[Issue access + refresh tokens]

  I[Login] --> J[Validate credentials]
  J --> K{2FA enabled?}
  K -->|Yes| L[Return requires2FA + userId]
  L --> M[POST /verify-totp]
  M --> H
  K -->|No| H

  N[OAuth Google/Facebook] --> O[Find or create verified user]
  O --> H

  H --> P[Set HTTP-only cookies]
  H --> Q[Store refresh token in DB]

  R[Logout] --> S[Blacklist access token in Redis]
  S --> T[Delete refresh token(s)]
```

- **Access token**: short-lived JWT (Bearer header or cookie), blacklisted on logout.
- **Refresh token**: longer-lived JWT stored in `RefreshToken` table; rotated on use.
- **Email verification**: required before login (OAuth users are auto-verified).
- **2FA**: TOTP secret generated on enable; verification activates the flag; login requires extra step.
- **Cookies**: `accessToken` (15 min) and `refreshToken` (7 days), `httpOnly`, `sameSite=lax`, `secure` in production.

---

## API Documentation

- **OpenAPI**: 3.0.0
- **Title**: TriAD E-Commerce API
- **Version**: 1.0.0
- **Security scheme**: `bearerAuth` (JWT)
- **UI mount**: `/api/docs` (Swagger UI)
- **Scan paths**: `./src/modules/**/*.ts`, `./src/shared/**/*.ts`
- Server URL defaults to `http://localhost:5000` (overridable via `API_URL`)

After starting the server:

```
http://localhost:5000/api/docs
```

---

## API Endpoints

All routes are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <accessToken>` (or the corresponding cookie).

### Authentication (`/api/auth`)

| Method | Endpoint               | Auth | Role | Description                        |
| ------ | ---------------------- | ---- | ---- | ---------------------------------- |
| POST   | `/register`            | No   | —    | Register + send verification email |
| GET    | `/verify-email?token=` | No   | —    | Verify email, issue tokens         |
| POST   | `/resend-verification` | No   | —    | Resend verification email          |
| POST   | `/login`               | No   | —    | Login (may return `requires2FA`)   |
| POST   | `/refresh`             | No   | —    | Refresh tokens                     |
| POST   | `/logout`              | Yes  | —    | Logout + invalidate tokens         |
| POST   | `/2fa/enable`          | Yes  | —    | Generate TOTP secret + otpauth URL |
| POST   | `/2fa/verify`          | Yes  | —    | Activate 2FA                       |
| POST   | `/verify-totp`         | No   | —    | Complete 2FA login                 |
| GET    | `/google`              | No   | —    | Redirect to Google OAuth           |
| GET    | `/google/callback`     | No   | —    | Google callback → set cookies      |
| GET    | `/facebook`            | No   | —    | Redirect to Facebook OAuth         |
| GET    | `/facebook/callback`   | No   | —    | Facebook callback → set cookies    |

### Users (`/api/users`)

| Method | Endpoint       | Auth | Role | Description     |
| ------ | -------------- | ---- | ---- | --------------- |
| GET    | `/me`          | Yes  | —    | Get profile     |
| PUT    | `/me`          | Yes  | —    | Update profile  |
| PUT    | `/me/password` | Yes  | —    | Change password |

### Products (`/api/products`)

| Method | Endpoint             | Auth | Role  | Description                         |
| ------ | -------------------- | ---- | ----- | ----------------------------------- |
| GET    | `/`                  | No   | —     | List products (filters, pagination) |
| GET    | `/categories`        | No   | —     | Category list with counts           |
| GET    | `/slug/:slug`        | No   | —     | Get by slug                         |
| GET    | `/:id`               | No   | —     | Get by ID                           |
| GET    | `/admin/all`         | Yes  | ADMIN | Admin list (includes inactive)      |
| POST   | `/admin`             | Yes  | ADMIN | Create product                      |
| PUT    | `/admin/:id`         | Yes  | ADMIN | Update product                      |
| DELETE | `/admin/:id`         | Yes  | ADMIN | Soft-delete (deactivate)            |
| PATCH  | `/admin/:id/restore` | Yes  | ADMIN | Reactivate                          |

### Cart (`/api/cart`)

| Method | Endpoint            | Auth | Role | Description     |
| ------ | ------------------- | ---- | ---- | --------------- |
| GET    | `/`                 | Yes  | —    | Get cart        |
| POST   | `/items`            | Yes  | —    | Add item        |
| PUT    | `/items/:productId` | Yes  | —    | Update quantity |
| DELETE | `/items/:productId` | Yes  | —    | Remove item     |
| DELETE | `/`                 | Yes  | —    | Clear cart      |

### Checkout (`/api/checkout`)

| Method | Endpoint | Auth | Role | Description                               |
| ------ | -------- | ---- | ---- | ----------------------------------------- |
| POST   | `/`      | Yes  | —    | Place order (idempotency key recommended) |

Body fields (validated): `paymentMethod` (COD|CARD|BANKING), `address`, `phone`, optional `notes`, `discountCode`, `idempotencyKey`.

### Orders (`/api/orders`)

| Method | Endpoint    | Auth | Role | Description       |
| ------ | ----------- | ---- | ---- | ----------------- |
| GET    | `/`         | Yes  | —    | List user orders  |
| GET    | `/:orderId` | Yes  | —    | Get order details |

### Reviews (`/api/reviews`)

| Method | Endpoint              | Auth | Role  | Description              |
| ------ | --------------------- | ---- | ----- | ------------------------ |
| GET    | `/product/:productId` | No   | —     | List reviews for product |
| POST   | `/`                   | Yes  | —     | Create review            |
| DELETE | `/:reviewId`          | Yes  | —     | Delete (owner or ADMIN)  |
| GET    | `/admin/all`          | Yes  | ADMIN | Admin list all reviews   |

### Notifications (`/api/notifications`)

Authenticated routes for listing and managing user notifications (see source for exact paths).

### Health

| Method | Endpoint  | Auth | Description          |
| ------ | --------- | ---- | -------------------- |
| GET    | `/health` | No   | Liveness + timestamp |

---

## Environment Variables

Configuration is validated with Zod at startup. Production requires SMTP settings.

```env
# Core
NODE_ENV=development          # development | test | production
PORT=5000
API_URL=http://localhost:5000 # optional, used by Swagger

# Database & Cache
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/triad?schema=public
REDIS_URL=redis://localhost:6379

# JWT (min 32 characters)
JWT_ACCESS_SECRET=replace-with-at-least-32-characters-secret
JWT_REFRESH_SECRET=replace-with-at-least-32-characters-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_CALLBACK_URL=http://localhost:5000/api/auth/facebook/callback

# Frontend & CORS
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000   # comma-separated list; empty in prod is rejected

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# 2FA
TOTP_ISSUER=TriAD

# Idempotency
IDEMPOTENCY_TTL=86400

# Logging
LOG_LEVEL=info                # debug | info | warn | error
LOG_FILE_PATH=./logs

# SMTP (required in production)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@triad.com

# Optional
COOKIE_DOMAIN=                # production cookie domain
```

Create a `.env` file in the project root (or use Docker environment injection).

---

## Local Development

### Prerequisites

- Node.js (compatible with TypeScript 5.3 / ES2022)
- npm
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)
- Docker & Docker Compose (recommended)

### Installation

```bash
npm install
```

### Environment

```bash
# Linux / macOS
cp .env.example .env   # if present; otherwise create manually from the list above

# Windows (PowerShell)
Copy-Item .env.example .env
```

### Database

```bash
npm run prisma:generate   # generate Prisma Client
npm run prisma:migrate    # run migrations (dev)
npm run prisma:studio     # optional GUI
npm run seed              # seed admin, test user, sample products
```

### Development Server

```bash
npm run dev
```

Server listens on `PORT` (default 5000). Logs show connection status and the docs URL.

### Production Build

```bash
npm run build   # tsc + tsc-alias → dist/
npm start       # node dist/server.js
```

---

## Docker

`docker-compose.yml` defines three services:

| Service  | Image / Build          | Ports     | Notes                                              |
| -------- | ---------------------- | --------- | -------------------------------------------------- |
| postgres | postgres:16-alpine     | 5433→5432 | healthcheck, volume `postgres_data`                |
| redis    | redis:7-alpine         | 6379→6379 | healthcheck, volume `redis_data`                   |
| backend  | multi-stage Dockerfile | 5000→5000 | depends on healthy postgres + redis, `npm run dev` |

```bash
docker compose up --build
docker compose down
```

Environment variables for the backend service are injected via the compose file (DATABASE_URL, REDIS_URL, etc.). Source is volume-mounted for live development.

---

## Database / Prisma

The Prisma schema defines (inferred from usage and seed):

- **User** — email (unique), password (nullable for OAuth), firstName, lastName, phone, role (`USER`|`ADMIN`), isVerified, is2FAEnabled, totpSecret, relations to Cart, RefreshToken, Order, Review, Notification
- **Cart** / **CartItem** — one cart per user, unique (cartId, productId)
- **Product** — name, description, price, stock, category, images[], slug (unique), isActive, version (concurrency)
- **Order** / **OrderItem**
- **Review** — rating 1–5, comment, unique user+product
- **Notification**
- **RefreshToken** — token, userId, expiresAt

Cascading deletes and indexes are defined in the schema (not fully reproduced here because the binary schema file is excluded from the export). Soft-delete is implemented for products via `isActive`.

Simplified relationship view:

```mermaid
erDiagram
  User ||--o| Cart : has
  User ||--o{ RefreshToken : has
  User ||--o{ Order : places
  User ||--o{ Review : writes
  User ||--o{ Notification : receives
  Cart ||--o{ CartItem : contains
  Product ||--o{ CartItem : referenced
  Product ||--o{ OrderItem : referenced
  Product ||--o{ Review : receives
  Order ||--o{ OrderItem : contains
```

---

## Testing

Vitest is configured with path aliases and a global setup that connects Prisma/Redis and truncates tables after each test.

```text
tests/
├── integration/
│   └── checkout.concurrent.test.ts   # concurrent checkout overselling protection
├── unit/
│   └── modules/
│       ├── auth/auth.service.test.ts
│       └── products/products.service.test.ts
└── setup.ts
```

```bash
npm test                 # run once
npm run test:watch       # watch mode
npm run test:coverage    # coverage report
```

Coverage is not claimed to be complete; the suite currently focuses on auth service, products admin CRUD, and concurrent checkout.

---

## Seed Data

`npm run seed` (development only):

- **Admin**: `admin@shop.vn` / `admin123` (role `ADMIN`, verified)
- **User**: `user@example.com` / `user123` (verified)
- Five sample glass storage products with prices in VND, stock, and image paths

Do **not** use these credentials outside local development.

---

## Security Notes

- Passwords hashed with bcrypt (10 rounds)
- JWT secrets required ≥ 32 characters
- Access tokens blacklisted on logout (Redis TTL = remaining lifetime)
- Refresh tokens stored server-side and deleted on logout / rotation
- HTTP-only, same-site cookies; secure flag enabled in production
- Helmet, CORS allow-list, rate limiting, Zod validation, RBAC
- Sensitive request fields redacted in logs
- Idempotency keys for write operations

This is **not** a claim of production security completeness. Review secrets management, SMTP credentials, and network exposure before any deployment.

---

## Logging and Operations

- Console + daily rotating files under `LOG_FILE_PATH` (default `./logs`)
- Log level controlled by `LOG_LEVEL`
- Request ID generated or taken from `x-request-id`
- Graceful shutdown on SIGTERM/SIGINT (10 s hard timeout)
- Startup verifies Prisma and Redis connectivity

---

## Available npm Scripts

| Command                   | Purpose                                |
| ------------------------- | -------------------------------------- |
| `npm run dev`             | Development server (nodemon + ts-node) |
| `npm run build`           | Compile TypeScript → `dist/`           |
| `npm start`               | Run compiled server                    |
| `npm test`                | Run Vitest once                        |
| `npm run test:watch`      | Vitest watch mode                      |
| `npm run test:coverage`   | Coverage report                        |
| `npm run prisma:generate` | Generate Prisma Client                 |
| `npm run prisma:migrate`  | Run Prisma migrations (dev)            |
| `npm run prisma:studio`   | Open Prisma Studio                     |
| `npm run seed`            | Seed development data                  |
| `npm run format`          | Prettier format                        |
| `npm run lint`            | ESLint                                 |

---

## Project Structure (simplified)

```text
├── prisma/                 # schema & migrations
├── scripts/seed.ts
├── src/
│   ├── config/
│   ├── core/               # database, logger, queue, redis
│   ├── jobs/
│   ├── modules/            # domain modules (auth … users)
│   ├── shared/             # middlewares, utils, types, services
│   ├── app.ts
│   └── server.ts
├── tests/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

---

## Engineering Characteristics

- Modular domain folders with consistent controller → service → repository layering
- Interface-based repositories for testability
- Zod configuration and request validation
- JWT + OAuth2 + TOTP 2FA
- Redis for blacklists, idempotency, rate-limit store, email-verification tokens
- BullMQ background jobs with retry/backoff
- Soft-delete products and admin restore
- Concurrent checkout test demonstrating stock consistency
- Structured logging with rotation and request correlation
- Graceful process shutdown

---

## Limitations / Known Gaps

- `prisma/schema.prisma` and `Dockerfile` are present in the repository but were excluded from the text export; refer to the actual files for full schema and multi-stage build details.
- Email and image workers contain functional implementations, but the email worker still has a residual placeholder comment in the queue definition file.
- Image processing writes to local filesystem (`uploads/products`); no cloud storage integration is present.
- No CI/CD configuration is included in the repository.
- Test coverage is limited to selected unit and one integration scenario.
- Payment methods (CARD, BANKING) are accepted as strings; no external payment-gateway integration exists.
- Discount codes are accepted in the DTO but business logic for them is not fully expanded in the visible service code.
- Production SMTP variables are enforced only at config validation time; actual delivery depends on correct credentials.
- License file is not present.

---

## Development Workflow

```mermaid
flowchart TD
  A[npm install] --> B[Create .env]
  B --> C[docker compose up -d postgres redis]
  C --> D[npm run prisma:generate]
  D --> E[npm run prisma:migrate]
  E --> F[npm run seed]
  F --> G[npm run dev]
  G --> H[Open /api/docs]
  H --> I[npm test]
  I --> J[npm run build]
```

---

## License

License information is not currently defined in the repository.

```

```
