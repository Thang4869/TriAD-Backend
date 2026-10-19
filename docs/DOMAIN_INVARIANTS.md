# Domain Invariants — TriAD Backend

**Checked:** 2026-10-18 against domain entities on main. This document records **actual model rules** and test coverage, not a claim that every G3 gate has passed.

| Domain | Invariant / behavior | Implementation | Test evidence | Remaining work |
| --- | --- | --- | --- | --- |
| Money | Amount must be finite, nonnegative, rounded to integer with JavaScript Math.round, and a safe integer. Currency is three uppercase letters. | [Money](../src/shared/value-objects/money.ts) | Review [unit test directory](../tests/unit) | [Money unit tests](../tests/unit/shared/value-objects/money.test.ts) cover half-unit boundaries; retain current rounding policy unless a migration is approved |
| Money | Arithmetic rejects mismatched currencies; subtraction cannot produce negative Money | [Money](../src/shared/value-objects/money.ts) | Existing tests to audit | Confirm rounding policy with downstream persistence/checkout |
| Order | Only positive integer line-item quantities; cannot merge same product with a different unit price | [Order](../src/modules/orders/domain/order.entity.ts) | [Order unit tests](../tests/unit/modules/orders/order.entity.test.ts) | Safe integer and merge overflow guarded in [#198](https://github.com/Thang4869/TriAD-Backend/pull/198); confirm persistence consistency |
| Order | Cannot place an empty order or place twice; no item mutations after placement; discounts cannot exceed subtotal at pricing application | [Order](../src/modules/orders/domain/order.entity.ts) | [Order unit tests](../tests/unit/modules/orders/order.entity.test.ts) | Review invalid pricing during hydration |
| Order | Status transition must follow PENDING→PROCESSING/CANCELLED, PROCESSING→SHIPPED/CANCELLED, SHIPPED→DELIVERED; terminal states reject transitions | [Order.canTransition](../src/modules/orders/domain/order.entity.ts) | [Property-based test](../tests/unit/modules/orders/order.state-machine.property.test.ts) | Confirm no direct status mutation outside entity |
| Cart | Items identified by product ID; removing nonexisting item is a no-op; quantity less than zero is rejected, zero update removes item | [Cart](../src/modules/cart/domain/cart.entity.ts) | [Cart entity tests](../tests/unit/modules/cart/cart.entity.test.ts) and [service tests](../tests/unit/modules/cart/cart.service.test.ts) | Integer/safe-quantity tests merged in [#197](https://github.com/Thang4869/TriAD-Backend/pull/197) and [#198](https://github.com/Thang4869/TriAD-Backend/pull/198); review event semantics for decreases |
| Product | Stock reduction cannot exceed available stock; positive safe-integer quantities required for stock changes, rejected requests produce no events | [Product](../src/modules/products/domain/product.entity.ts) | [Product unit tests](../tests/unit/modules/products/product.entity.test.ts) (new negative cases) | Also validate hydrate initial stock and overflow on restock |
| Product | Depleting stock to zero emits ProductStockDepleted; price changes emit ProductPriceChanged; activation/deactivation reject repeated identical action | [Product](../src/modules/products/domain/product.entity.ts) | [Product unit tests](../tests/unit/modules/products/product.entity.test.ts) | Audit all write-side adapters |

## Rounding decision

The existing Money constructor uses `Math.round(amount)`, not floating-point cents and not banker’s rounding. This means positive half units round up. Changing the policy could change behavior and persisted order totals, so do not switch algorithms as a cleanup; define a migration/compatibility decision and test before changing it.

## Architectural scope

Do not elevate straightforward reviews, wishlists and notifications into aggregates without transaction boundaries or invariants requiring it. See [CRUD modules ADR](adr/2026-10-18-crud-module-boundaries.md) for this documented decision. Domain rules may be implemented, but G3 remains **PARTIAL** until each invariant has verified test evidence and the CRUD decision is documented.

See [Current Work Checklist](TriAD-Backend-Improvement-Checklist.md).
