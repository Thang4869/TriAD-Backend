# ADR — Keep Reviews, Wishlist and Notifications as Application-Orchestrated CRUD

**Date:** 2026-10-18  
**Status:** Accepted for current portfolio scope; revisit when business invariants change.

## Context

TriAD is a modular monolith with a domain model for transactionally significant flows such as Order, Cart, Product and Money. The current [ReviewsService](../../src/modules/reviews/reviews.service.ts), [WishlistService](../../src/modules/wishlist/wishlist.service.ts) and [NotificationsService](../../src/modules/notifications/notifications.service.ts) coordinate repository operations and application-level validation.

- Reviews enforce existence of the product, one review per user/product at the service boundary, and ownership checks before delete.
- Wishlist enforces product existence and prevents duplicate items at the service boundary.
- Notifications list, create and mark records read, including an idempotency key at creation.

There is currently no demonstrated cross-entity lifecycle or multi-step invariant in these services that benefits from a separate aggregate root. Their repository models and typed service interfaces are sufficient for today's use cases.

## Decision

**Keep CRUD/application services**, backed by repository ports and concrete typed return DTOs. Do not introduce aggregates, factories, domain events or strategy interfaces solely to increase OOP-pattern counts. Preserve authorization, uniqueness and idempotency constraints at the appropriate application and persistence boundaries.

## Consequences and verification

- Less ceremony and fewer objects with artificial responsibilities; the code remains testable through repository ports.
- Prisma schema already declares `@@unique([userId, productId])` on Review and WishlistItem and a unique notification idempotency key ([schema](../../prisma/schema.prisma)). These constraints guard duplicate records even when service-level prechecks race. Verify the application error mapping and database concurrency behavior separately; this ADR does not claim the end-to-end error response has passed without integration evidence.
- Promotion to a richer domain model is justified only if moderation state transitions, notification delivery lifecycle, wishlist reservation logic, or auditable business invariants emerge.
- CI typecheck, service tests and architecture boundary checks provide code-level evidence; production/staging readiness is a separate gate.

Related evidence: [Domain Invariants](../DOMAIN_INVARIANTS.md), [Current Work Checklist](../TriAD-Backend-Improvement-Checklist.md).
