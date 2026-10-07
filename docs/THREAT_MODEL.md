# TriAD Backend Threat Model

> Security threat model for the TriAD Backend e-commerce platform.

This document identifies security-sensitive assets, trust boundaries, attack surfaces, abuse scenarios, existing mitigations, residual risks, and security verification requirements for the TriAD Backend.

The goal is not to claim that the system is immune to attacks. The goal is to make security assumptions explicit, identify realistic threats, and ensure that important security controls are intentional, testable, and maintainable.

---

## 1. Scope

This threat model covers the backend application and the infrastructure directly involved in processing requests and asynchronous workloads.

Primary components include:

- Node.js / TypeScript API
- Express HTTP layer
- Authentication and authorization
- JWT access and refresh tokens
- OAuth authentication
- Two-factor authentication
- PostgreSQL
- Prisma
- Redis
- BullMQ
- Checkout and order processing
- Idempotency handling
- CSRF protection
- Product and image management
- Cloudinary integration
- Email delivery
- Outbox pattern
- Projection/read models
- OpenTelemetry
- Metrics and API documentation endpoints
- Docker-based production deployment

This document primarily considers threats originating from:

- Anonymous internet users
- Authenticated users
- Compromised user accounts
- Automated bots
- Malicious API clients
- Misconfigured infrastructure
- Leaked credentials
- Dependency compromise
- Application bugs
- Operational mistakes

---

## 2. Security Objectives

The system should preserve the following security properties.

### Confidentiality

Sensitive data must not be disclosed to unauthorized parties.

Examples:

- Password hashes
- Refresh tokens
- Access tokens
- TOTP secrets
- OAuth credentials
- Database credentials
- Redis credentials
- SMTP credentials
- Cloudinary credentials
- User profile information
- Order information
- Administrative data

### Integrity

Attackers must not be able to modify data or system state without authorization.

Important integrity-sensitive operations include:

- Creating orders
- Updating inventory
- Changing product information
- Modifying account information
- Changing authentication credentials
- Issuing or rotating tokens
- Updating order state
- Administrative actions

### Availability

The system should remain available under normal failures and reasonable hostile traffic.

Important availability-sensitive resources include:

- API workers
- PostgreSQL connections
- Redis connections
- BullMQ workers
- Outbox relay
- External APIs
- Email queues

### Authentication

The backend must reliably determine the identity associated with protected requests.

### Authorization

Authenticated identity alone must never imply unrestricted access.

Every protected action must enforce the appropriate ownership or role rules.

### Auditability

Security-relevant events should be observable without leaking secrets.

---

## 3. System Assets

The following assets require protection.

| Asset | Security concern |
| --- | --- |
| User credentials | Confidentiality |
| Password hashes | Confidentiality |
| JWT access tokens | Confidentiality / integrity |
| Refresh tokens | Confidentiality / integrity |
| Token revocation state | Integrity |
| TOTP secrets | Confidentiality |
| OAuth identities | Integrity |
| User accounts | Confidentiality / integrity |
| Shopping carts | Integrity |
| Product inventory | Integrity |
| Product pricing | Integrity |
| Orders | Confidentiality / integrity |
| Order history | Integrity |
| Administrative privileges | Integrity |
| Database records | Confidentiality / integrity |
| Redis state | Integrity / availability |
| BullMQ jobs | Integrity / availability |
| Outbox events | Integrity |
| Projection state | Integrity |
| Application secrets | Confidentiality |
| Logs | Confidentiality / integrity |
| Metrics | Confidentiality |
| API documentation | Information disclosure |
| Cloudinary credentials | Confidentiality |
| SMTP credentials | Confidentiality |
| CI/CD credentials | Confidentiality |

---

## 4. Actors

### Anonymous User

A client without an authenticated session.

Expected capabilities:

- Browse public products
- Access public API routes
- Register
- Login
- Initiate OAuth authentication

Potential threats:

- Credential stuffing
- Enumeration
- Abuse
- Injection attempts
- Rate-limit exhaustion
- CSRF attempts
- Malformed input attacks

### Authenticated User

A valid application user.

Expected capabilities:

- Manage personal account information
- Manage personal cart
- Checkout
- View owned orders
- Use authenticated application features

Potential threats:

- Accessing another user's resources
- Price manipulation
- Quantity manipulation
- IDOR/BOLA
- Replaying requests
- Token abuse

### Administrator

A privileged account capable of modifying protected business resources.

Potential impact of compromise is significantly greater than a normal user.

Administrative actions require stronger authorization guarantees and should be treated as high-risk operations.

### External Attacker

An actor attempting to exploit the publicly exposed API or infrastructure.

### Compromised Dependency

A malicious or vulnerable package capable of executing within the application or build environment.

### Infrastructure Operator

A trusted operator with infrastructure-level access.

Operational mistakes remain part of the threat model even when they are non-malicious.

---

## 5. Trust Boundaries

A trust boundary exists whenever data crosses between components with different security assumptions.

### 5.1 Browser / Client → API

```text
Browser / Client
       |
       | HTTPS
       v
   TriAD API
```

Untrusted input crosses this boundary.

Never trust:

- Headers
- Cookies
- Request body
- Query strings
- Route parameters
- Client-side prices
- Client-side roles
- Client-generated identifiers

All input must be validated server-side.

### 5.2 API → PostgreSQL

```text
TriAD API
    |
    | Prisma
    v
PostgreSQL
```

Database integrity depends on:

- Correct authorization
- Correct transactional boundaries
- Safe schema migrations
- ORM query correctness
- Database credential protection

### 5.3 API → Redis

```text
TriAD API
    |
    v
  Redis
```

Redis may contain security-sensitive runtime information such as:

- Rate-limit state
- Token state
- Token revocation information
- Idempotency state
- Queue infrastructure data

Redis compromise can therefore affect both security and availability.

### 5.4 API → BullMQ Workers

```text
API
 |
 v
Redis
 |
 v
BullMQ Worker
```

Queued data must be treated as potentially hostile unless created exclusively from validated server-side data.

Workers must not assume queue payloads are inherently trusted.

### 5.5 API → External Providers

External systems include:

```text
TriAD Backend
   |
   +----> SMTP Provider
   |
   +----> Cloudinary
   |
   +----> OAuth Providers
```

External dependencies introduce:

- Credential leakage risk
- Availability risk
- API behavior changes
- Rate limits
- Supply-chain dependencies

---

## 6. Attack Surface

Major public attack surfaces include:

- Authentication routes
- OAuth routes
- Refresh-token routes
- Product endpoints
- Cart endpoints
- Checkout endpoints
- Order endpoints
- Review endpoints
- User endpoints
- Image upload functionality
- Administrative endpoints
- Metrics endpoint
- API documentation endpoint
- Health endpoints

Internal attack surfaces include:

- Redis
- PostgreSQL
- BullMQ
- Outbox relay
- Projection workers
- Docker runtime
- Environment variables

---

## 7. STRIDE Threat Analysis

### 7.1 Spoofing

Spoofing occurs when an attacker impersonates another identity.

Threats:

- Stolen access tokens
- Stolen refresh tokens
- JWT forgery
- OAuth identity confusion
- Session fixation
- Credential stuffing
- Refresh-token replay
- Compromised TOTP secrets

Mitigations:

- JWT signature verification
- Separate access and refresh token secrets
- Refresh-token persistence
- Token revocation
- Refresh-token rotation
- Authentication middleware
- OAuth provider validation
- TOTP verification
- Strong secret configuration
- Short-lived access tokens

Residual risk:

A valid access token stolen from a compromised client may remain usable until expiration unless explicitly revoked.

### 7.2 Tampering

Tampering occurs when an attacker modifies data or requests in an unauthorized manner.

Examples include changing:

```json
{
  "price": 1,
  "quantity": 100000,
  "userId": "another-user",
  "role": "ADMIN"
}
```

The backend must not accept sensitive business state directly from client assertions.

Mitigations:

- Server-side pricing
- Server-side product lookup
- Repository-backed inventory validation
- Request validation
- Authorization checks
- Database transactions
- Optimistic concurrency / version checking
- Controlled domain state transitions

### 7.3 Repudiation

Repudiation occurs when actors deny having performed an operation and the system cannot establish what happened.

Important operations include:

- Authentication
- Checkout
- Order creation
- Order status changes
- Administrative changes
- Security failures

Mitigations:

- Structured logging
- Request correlation IDs
- Domain events
- Outbox events
- Order history projections
- Operational traces

Sensitive credentials must never be logged merely to improve auditability.

### 7.4 Information Disclosure

Potentially sensitive information includes:

- Stack traces
- Internal database errors
- Prisma errors
- JWT contents
- Refresh tokens
- Environment variables
- Database connection strings
- Internal architecture
- Metrics
- API documentation

Production responses should use normalized application errors rather than raw internal exceptions.

Sensitive values that should never appear in production responses include:

```text
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
JWT_PREAUTH_SECRET
TOTP_ENCRYPTION_KEY
SMTP_PASS
CLOUDINARY_API_SECRET
```

### 7.5 Denial of Service

Potential attacks include:

- High request volume
- Login brute force
- Expensive search queries
- Large pagination values
- Large JSON payloads
- Checkout spam
- Queue flooding
- Redis exhaustion
- Database connection exhaustion
- Repeated image uploads

Mitigations:

- API rate limiting
- Endpoint-specific rate limiting where appropriate
- Pagination limits
- Input validation
- Request size limits
- Queue isolation
- Database pooling
- Health checks
- Docker restart policies
- Bounded retry behavior

Retries must use bounded attempts and jitter to avoid retry storms.

### 7.6 Elevation of Privilege

An attacker may attempt to gain permissions not assigned to them.

Examples:

- Normal user accessing admin routes
- User reading another user's order
- User modifying another user's cart
- User supplying an `ADMIN` role in the request
- Manipulating route identifiers

Authorization must depend on trusted server-side data.

Never authorize based on:

```text
req.body.role
req.body.userId
req.query.role
client-side UI state
```

Authorization should use identity resolved from verified authentication data.

---

## 8. Authentication Threats

Authentication is one of the highest-risk areas in the system.

### Credential Stuffing

An attacker attempts credentials leaked from another service.

Mitigations:

- Rate limiting
- Generic authentication failures
- Secure password hashing
- Optional 2FA

### User Enumeration

An attacker attempts to determine whether an email address exists.

Avoid significantly different error behavior for:

```text
Unknown account
Wrong password
```

where revealing this distinction is unnecessary.

### JWT Forgery

An attacker creates a fake access token.

Mitigations:

- Strong signing secrets
- Correct verification algorithm
- Token signature verification
- Environment validation

### Access Token Replay

An attacker steals a valid access token and reuses it.

Mitigations:

- Short expiration
- Token revocation where required
- TLS
- Secure client storage strategy

---

## 9. Refresh Token Security

Refresh tokens represent long-lived authentication authority and require stronger protection than access tokens.

Primary threats:

- Token theft
- Token replay
- Concurrent refresh race
- Reuse of superseded token
- Revoked token reuse

The backend should enforce a clear refresh-token lifecycle:

```text
ISSUED
  |
  v
ACTIVE
  |
  +---- refresh ----> ROTATED
                        |
                        v
                     REVOKED
```

A previously rotated refresh token must not silently become valid again.

Concurrency handling must prevent two simultaneous refresh attempts from independently creating valid token chains.

---

## 10. Two-Factor Authentication

TOTP secrets must be treated as authentication credentials.

Threats:

- Secret leakage
- Logging the secret
- Database compromise
- Replay within TOTP validity window
- Backup-code abuse if introduced later

Mitigations:

- Encrypt TOTP secrets at rest
- Never log TOTP secrets
- Restrict TOTP verification attempts
- Use secure random secret generation

The encryption key must remain outside source control.

---

## 11. OAuth Threats

OAuth introduces trust in external identity providers.

Potential threats include:

- Forged callback requests
- Account-linking mistakes
- Provider identity confusion
- Missing verification checks
- OAuth CSRF

Identity mapping must be based on provider-verified identifiers rather than untrusted client claims.

---

## 12. CSRF

Cookie-authenticated requests may be vulnerable to Cross-Site Request Forgery.

State-changing methods include:

```text
POST
PUT
PATCH
DELETE
```

The current CSRF protection uses a token associated with the client and verifies the request header against the expected CSRF token.

Typical flow:

```text
Cookie:
csrfToken=<token>

Header:
x-csrf-token: <token>
```

Read-only HTTP methods such as:

```text
GET
HEAD
OPTIONS
```

should not mutate application state.

Bearer-authenticated API clients may follow different CSRF semantics because authorization headers cannot normally be attached cross-origin by a malicious website without explicit browser permission.

---

## 13. CORS

CORS is not an authentication control.

It limits browser behavior but does not prevent direct HTTP clients from calling the API.

Production configuration should avoid unrestricted origins when credentials are enabled.

Unsafe example:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

Production allowed origins must come from explicit configuration.

---

## 14. Checkout Threat Model

Checkout is one of the highest-value attack surfaces.

Potential attacks include:

- Client-side price manipulation
- Quantity manipulation
- Inventory race conditions
- Duplicate checkout
- Replayed requests
- Concurrent checkout
- Order-number collisions
- Partial transactions

### Server-Side Price Authority

The client must never determine the final payable amount.

Unsafe:

```text
total = req.body.total
```

Expected:

```text
product IDs
      |
      v
server product lookup
      |
      v
server pricing logic
      |
      v
final amount
```

---

## 15. Inventory Race Conditions

Example:

```text
Stock = 1

Request A reads stock = 1
Request B reads stock = 1

A purchases item
B purchases item
```

Without concurrency protection:

```text
Stock = -1
```

Mitigations may include:

- Database transaction
- Conditional update
- Version column
- Optimistic concurrency
- Retry policy

Retries must remain bounded.

---

## 16. Idempotency

Network retries can unintentionally create duplicate orders.

Example:

```text
POST /checkout
```

Client receives a timeout after the server already created the order.

The client retries.

Without idempotency:

```text
Order #1 created
Order #2 created
```

With an `Idempotency-Key`:

```text
Request 1
Idempotency-Key: abc

Request 2
Idempotency-Key: abc
```

The second request should not create another equivalent operation.

The backend should also prevent the same key from being reused with incompatible request semantics.

---

## 17. Order Authorization

Order identifiers must never be treated as authorization.

Unsafe:

```text
GET /orders/:orderId

repository.findById(orderId)
```

Safer:

```text
repository.findByIdAndUser(orderId, authenticatedUserId)
```

unless the requester has explicit administrative authorization.

This mitigates Broken Object Level Authorization / IDOR attacks.

---

## 18. Domain State Integrity

Order state transitions must follow valid domain rules.

Example state flow:

```text
PENDING
   |
   v
CONFIRMED
   |
   v
SHIPPED
   |
   v
DELIVERED
```

Invalid arbitrary state changes should be rejected.

Business state must be controlled through domain behavior rather than accepting raw state assignments from the client.

---

## 19. Database Security

PostgreSQL is a high-value asset.

Threats include:

- Credential leakage
- Unauthorized network access
- Destructive migration
- Incorrect migration
- Excessive privileges
- Data exfiltration

Production databases should:

- Require authentication
- Not expose unnecessary public interfaces
- Use strong credentials
- Restrict network access
- Use backups
- Test recovery procedures

Database secrets must not be committed to Git.

---

## 20. Prisma and Persistence Errors

Raw Prisma exceptions may reveal implementation details.

Persistence failures should be translated into application-level errors.

The centralized persistence error classifier should produce stable API behavior without exposing database internals.

---

## 21. Redis Threat Model

Redis affects:

- Rate limiting
- Tokens
- Idempotency
- Queues
- Runtime coordination

Threats include:

- Unauthorized access
- State tampering
- Memory exhaustion
- Queue manipulation
- Token-state manipulation

Production Redis should not be publicly exposed unnecessarily.

---

## 22. BullMQ Threat Model

Queue workers operate asynchronously and can execute privileged backend behavior.

Threats include:

- Malicious payload
- Replayed jobs
- Queue flooding
- Infinite retry loops
- Poison jobs

Workers should:

- Validate payload shape
- Use bounded retries
- Record failures
- Avoid executing arbitrary code from payload values
- Avoid trusting user-supplied file paths or URLs without validation

---

## 23. Outbox Security

The Outbox pattern improves reliability but also creates a new integrity-sensitive event source.

Simplified flow:

```text
Business Transaction
        |
        +---- domain state
        |
        +---- outbox event
                 |
                 v
            Outbox Relay
                 |
                 v
             Handler
```

Threats include:

- Duplicate event processing
- Event tampering
- Replay
- Handler failure
- Poison events

Handlers should be idempotent wherever possible.

Processed-event tracking should prevent uncontrolled duplicate side effects.

---

## 24. Projection Security

Projection/read-model data should be derived from trusted events.

Threats:

- Duplicate event application
- Missing events
- Out-of-order events
- Manual projection corruption

Projection rebuild tooling should derive state from authoritative source data rather than accepting arbitrary external input.

---

## 25. Image Upload and Cloudinary

Image handling introduces content and external-service risk.

Threats include:

- Malicious file upload
- Unexpected MIME type
- Oversized files
- Storage abuse
- Credential leakage
- Malicious URLs

The server should validate:

- File type
- Maximum file size
- Expected upload context

Cloudinary secrets must never be exposed to untrusted clients when server-side credentials are intended.

---

## 26. Email Security

Email infrastructure may contain credentials and security-sensitive messaging.

Threats include:

- SMTP credential leakage
- Email flooding
- Header injection
- Malicious content
- Queue abuse

Email jobs should operate only on validated data.

SMTP secrets must remain outside source control.

---

## 27. Error Handling

Production error responses should not expose:

```text
stack traces
database queries
database credentials
filesystem paths
JWT secrets
environment variables
internal service topology
```

Errors should be normalized into stable categories such as:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
500 Internal Server Error
```

Correlation IDs may be returned or logged to support debugging without exposing internal error details.

---

## 28. Logging Security

Logs frequently become an accidental source of credential disclosure.

Never log:

```text
Authorization headers
Passwords
Refresh tokens
Access tokens
TOTP secrets
SMTP passwords
Database passwords
Cloudinary secrets
Encryption keys
```

Potentially sensitive personal data should also be minimized.

Prefer structured security events such as:

```json
{
  "event": "authentication_failed",
  "requestId": "...",
  "userId": "...",
  "reason": "invalid_credentials"
}
```

instead of dumping entire request objects.

---

## 29. Request Correlation

Each request should have a correlation identifier.

Example:

```text
x-request-id
```

or a server-generated equivalent.

This allows:

```text
HTTP request
   |
   v
application logs
   |
   v
database operation
   |
   v
queue event
```

to be investigated as one logical operation.

---

## 30. Metrics Security

Metrics may reveal:

- Internal route names
- Request rates
- Failure rates
- Infrastructure information
- Service behavior

Therefore production `/metrics` access should be protected rather than assumed to be harmless public data.

---

## 31. API Documentation Security

Interactive API documentation can significantly improve attacker reconnaissance.

Production exposure of routes such as:

```text
/api/docs
```

should be intentionally controlled.

Possible controls include:

- Disable in production
- Require authentication
- Restrict to trusted networks

---

## 32. Health Endpoints

Health endpoints should reveal only the information needed by infrastructure.

A public health response should avoid returning:

```text
database credentials
Redis URLs
internal hostnames
environment variables
stack traces
```

Useful example:

```json
{
  "status": "ok"
}
```

rather than detailed secret-bearing connection information.

---

## 33. Secrets Management

Secrets must never be committed to Git.

Important examples:

```text
DATABASE_URL
REDIS_URL

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
JWT_PREAUTH_SECRET

TOTP_ENCRYPTION_KEY

SMTP_USER
SMTP_PASS

CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

`.env.example` should contain placeholder values only.

Production secrets should be injected through the deployment environment or a dedicated secret-management system.

---

## 34. Secret Strength

Cryptographic secrets must be sufficiently random.

Unsafe:

```text
JWT_ACCESS_SECRET=mysecret
```

Preferred:

```text
cryptographically random value
```

Secrets protecting different security domains should not reuse the same value.

For example:

```text
JWT_ACCESS_SECRET != JWT_REFRESH_SECRET
```

---

## 35. Docker Security

Containerization does not automatically create a security boundary.

Potential risks include:

- Running as root
- Large attack surface
- Leaking build-time secrets
- Exposing unnecessary ports
- Outdated base images

Recommended production properties:

- Minimal runtime image
- Non-root application user where practical
- Only required ports exposed
- No development dependencies in runtime image
- No `.env` files copied into image
- Regular image rebuilds

---

## 36. Dependency Security

Third-party dependencies form part of the trusted computing base.

Potential threats:

- Known CVEs
- Malicious package releases
- Dependency confusion
- Compromised maintainers
- Unmaintained libraries

Recommended check:

```bash
npm audit
```

Dependency updates must still pass:

```text
typecheck
lint
tests
build
architecture checks
```

before release.

---

## 37. Architecture Boundaries as Security Controls

Architecture rules also contribute to security.

For example:

```text
domain
   X
   |
infrastructure
```

The domain layer should not directly depend on database implementations or transport-specific mechanisms.

Enforcing dependency direction reduces accidental coupling between trusted business logic and infrastructure concerns.

Automated architecture checks should therefore remain part of quality gates.

---

## 38. Input Validation

Every external input must be assumed hostile.

Validate:

- Request body
- Route parameters
- Query parameters
- Headers
- Uploaded files
- Pagination values
- Search values
- Enum values

Example:

```text
page = -999999
limit = 999999999
```

should not produce unbounded queries.

Public catalog pagination should enforce a maximum limit.

---

## 39. Injection Threats

Potential injection classes include:

- SQL injection
- Header injection
- Log injection
- Command injection
- Template injection

Using Prisma significantly reduces direct SQL injection risk when standard parameterized APIs are used, but raw query functionality still requires careful handling.

Never concatenate untrusted input into raw SQL.

---

## 40. Mass Assignment

Avoid directly copying arbitrary request bodies into persistence operations.

Unsafe:

```ts
repository.updateUser(req.body);
```

A malicious client could submit fields that were never intended to be mutable.

Prefer explicit input mapping:

```text
allowed request fields
        |
        v
application command
        |
        v
domain operation
```

---

## 41. Object Ownership

Resource ownership must be checked server-side.

Affected resources may include:

- Cart
- Orders
- Reviews
- User profile
- Wishlist

The presence of a resource UUID does not prove authorization.

---

## 42. Rate Limiting

Rate limits should protect endpoints whose abuse cost is significantly higher than a normal request.

High-priority candidates include:

- Login
- Registration
- Refresh token
- Password recovery
- 2FA verification
- Checkout
- Email-triggering endpoints
- Image upload

Rate-limit state stored in Redis should use bounded expiration periods to avoid unbounded key accumulation.

---

## 43. Replay Attacks

Potentially replayable operations include:

- Checkout
- Token refresh
- Email verification
- Password-reset operations
- Queue jobs

Mitigation depends on operation type.

Possible mechanisms:

- One-time tokens
- Token rotation
- Expiration
- Idempotency keys
- Database uniqueness constraints
- Used-token tracking

---

## 44. Race Conditions

Security-sensitive races include:

- Concurrent checkout
- Refresh-token rotation
- Stock modification
- Duplicate event processing
- Order creation

Concurrency behavior must be verified with tests rather than assumed correct from sequential unit tests.

---

## 45. Transaction Boundaries

Operations that must succeed or fail together should use explicit transactional boundaries.

Checkout is the primary example:

```text
validate cart
     |
calculate price
     |
reserve/update stock
     |
create order
     |
clear cart
```

Partial success may create inconsistent or exploitable business state.

---

## 46. Security Assumptions

This threat model currently assumes:

1. Production traffic uses HTTPS.
2. Production secrets are not committed to the repository.
3. PostgreSQL is not unnecessarily exposed to the public internet.
4. Redis is not unnecessarily exposed to the public internet.
5. OAuth credentials are managed securely.
6. Production CORS origins are explicitly configured.
7. Clients cannot directly modify database state.
8. CI/CD credentials are stored as platform secrets.
9. Administrative accounts remain limited to trusted operators.

If any assumption becomes false, the threat model must be reviewed.

---

## 47. Threat-to-Control Matrix

| Threat | Main control |
| --- | --- |
| JWT forgery | JWT signature verification |
| Access-token theft | Short TTL + TLS + revocation |
| Refresh-token replay | Rotation + revocation |
| Credential stuffing | Rate limiting |
| CSRF | CSRF token verification |
| CORS abuse | Explicit allowed origins |
| Price manipulation | Server-side pricing |
| Duplicate checkout | Idempotency |
| Inventory race | Transaction/concurrency control |
| IDOR/BOLA | Ownership checks |
| Invalid order transitions | Domain state machine |
| SQL injection | Prisma parameterization + validation |
| Queue replay | Idempotent handlers |
| Outbox duplicates | Handler tracking/idempotency |
| Secret leakage | Environment-based secrets |
| Error disclosure | Centralized error handler |
| Log leakage | Sensitive-data filtering |
| API reconnaissance | Protected production docs |
| Metrics disclosure | Protected production metrics |
| DoS | Rate limiting + bounded inputs |
| Retry storm | Bounded retry + jitter |

---

## 48. Security Verification Checklist

### Authentication

- [ ] Invalid JWT is rejected.
- [ ] Expired JWT is rejected.
- [ ] Revoked access token is rejected.
- [ ] Revoked refresh token is rejected.
- [ ] Superseded refresh token cannot create a new valid session.
- [ ] Concurrent refresh behavior is tested.
- [ ] Protected routes reject anonymous users.
- [ ] Unverified accounts cannot access restricted authentication flows where applicable.

### Authorization

- [ ] User cannot read another user's order.
- [ ] User cannot update another user's resources.
- [ ] Admin routes reject normal users.
- [ ] Authorization does not trust request-body role values.

### Checkout

- [ ] Client-provided price cannot override server price.
- [ ] Invalid product is rejected.
- [ ] Insufficient stock is rejected.
- [ ] Concurrent stock update is tested.
- [ ] Duplicate idempotency key does not duplicate an order.
- [ ] Conflicting idempotency-key reuse is rejected.
- [ ] Checkout transaction cannot leave partially committed state.

### CSRF

- [ ] Missing CSRF token rejects protected cookie-authenticated write requests.
- [ ] Invalid CSRF token is rejected.
- [ ] Valid CSRF token is accepted.
- [ ] Safe methods are not incorrectly blocked.
- [ ] Bearer-token behavior matches intended policy.

### Rate Limiting

- [ ] Global limiter works.
- [ ] Authentication abuse is limited.
- [ ] Redis-backed rate limits expire.
- [ ] Limiter failure behavior is understood.

### Errors

- [ ] Validation errors map correctly.
- [ ] Authentication errors map correctly.
- [ ] Domain errors map correctly.
- [ ] Persistence errors map correctly.
- [ ] Unexpected errors do not leak stack traces.
- [ ] Correlation ID is available for investigation.

### Infrastructure

- [ ] PostgreSQL is not publicly exposed unnecessarily.
- [ ] Redis is not publicly exposed unnecessarily.
- [ ] Production Docker image contains no `.env` file.
- [ ] `/metrics` is protected in production.
- [ ] `/api/docs` is protected or disabled in production.
- [ ] Health endpoints do not expose secrets.

### Secrets

- [ ] Repository contains no real production secrets.
- [ ] `.env.example` contains placeholders only.
- [ ] JWT secrets are sufficiently random.
- [ ] TOTP encryption key is sufficiently random.
- [ ] SMTP credentials are externalized.
- [ ] Cloudinary secret is externalized.

### Supply Chain

- [ ] Dependency audit reviewed.
- [ ] Lockfile committed.
- [ ] CI uses deterministic dependency installation.
- [ ] Dependency updates pass quality gates.

---

## 49. Recommended Security Tests

Security behavior should be validated through automated tests wherever practical.

Recommended test groups:

```text
tests/
├── unit/
│   ├── auth/
│   ├── csrf/
│   ├── idempotency/
│   ├── error-handler/
│   └── authorization/
│
├── integration/
│   ├── refresh-token-race/
│   ├── checkout-concurrency/
│   ├── order-ownership/
│   └── repository-security/
│
└── e2e/
    ├── authentication/
    ├── checkout/
    └── authorization/
```

Exact directory organization may differ from the repository's current test layout; the important requirement is that these security properties are automated.

---

## 50. Security Regression Principle

A security control should not be considered complete merely because the implementation exists.

A completed control should ideally have:

```text
implementation
      +
automated test
      +
operational configuration
      +
documentation
```

Example:

```text
CSRF middleware
      +
CSRF tests
      +
production cookie configuration
      +
documented behavior
```

This reduces the risk of future refactors silently removing security guarantees.

---

## 51. Incident Indicators

The following events may indicate abuse or compromise:

- Unusual login failure spikes
- High refresh-token rejection rate
- Large increase in `401` or `403` responses
- Repeated idempotency conflicts
- Sudden queue growth
- Repeated worker failures
- Unexpected order creation bursts
- Large stock inconsistencies
- Abnormal admin activity
- Unexpected metrics access
- Repeated CSRF failures
- Redis memory growth
- Database connection exhaustion

These signals should eventually feed operational alerts where appropriate.

---

## 52. Security Review Triggers

This document should be reviewed when any of the following occurs:

- New authentication mechanism
- New payment integration
- New OAuth provider
- Major checkout redesign
- New administrator capability
- New storage provider
- New queue infrastructure
- New external integration
- Significant database schema change
- Change in session/token model
- New production deployment architecture
- Security incident
- Major dependency vulnerability

---

## 53. Known Residual Risks

Even with the listed controls, some risks remain.

### Client Compromise

If the user's device or browser is compromised, valid credentials or tokens may be stolen.

### Dependency Compromise

A malicious dependency may bypass application-level controls.

### Infrastructure Compromise

An attacker with database, Redis, CI/CD, or production host access may operate below application authorization boundaries.

### Zero-Day Vulnerabilities

Framework or runtime vulnerabilities may exist before patches become available.

### Operational Error

Incorrect production configuration may weaken otherwise correct application controls.

These risks should be reduced through defense in depth rather than assumed to be completely eliminable.

---

## 54. Defense-in-Depth Model

TriAD should not depend on any single security control.

```text
Internet
   |
   v
Rate Limiting
   |
   v
Input Validation
   |
   v
Authentication
   |
   v
Authorization
   |
   v
Application / Domain Rules
   |
   v
Repository Constraints
   |
   v
Database Constraints
```

A failure in one layer should not automatically compromise the entire system.

---

## 55. Security Definition of Done

A security-sensitive feature is considered complete when:

- [ ] Threats have been identified.
- [ ] Input validation exists.
- [ ] Authentication requirements are defined.
- [ ] Authorization requirements are defined.
- [ ] Sensitive values are not logged.
- [ ] Error behavior is safe.
- [ ] Concurrency behavior is understood.
- [ ] Automated tests cover failure paths.
- [ ] Production configuration is documented.
- [ ] Secrets remain outside source control.
- [ ] Operational impact is understood.

---

## 56. Core Security Principles

The backend must assume that every externally controlled value can be malicious.

```text
Never trust the client.
Never trust identifiers as authorization.
Never trust prices supplied by the client.
Never trust retries to happen only once.
Never assume asynchronous jobs execute exactly once.
Never expose secrets for debugging convenience.
Never rely on frontend restrictions for backend security.
```

Security controls should remain explicit, testable, observable, and independent from UI behavior.

---

## 57. Document Maintenance

This document should evolve together with the architecture.

When a new trust boundary, external dependency, authentication mechanism, privileged operation, or high-value business workflow is introduced, this threat model should be updated in the same development cycle.

**Document:** `docs/THREAT_MODEL.md`  
**Project:** TriAD Backend  
**Purpose:** Production security design, architecture review, portfolio documentation, and regression prevention.
