import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import prisma from "@core/database/prisma";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { PricingService } from "@modules/checkout/services/pricing.service";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { noopMetrics, noopTracer } from "../helpers/observability";

async function seededCart() {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: "t2-" + id + "@example.invalid",
      password: "unused",
      firstName: "Retry",
      lastName: "Buyer",
      isVerified: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Price lock test product",
      description: "Snapshot vs transaction price",
      slug: "t2-product-" + id,
      category: "test",
      price: "1000",
      stock: 5,
      images: [],
    },
  });
  const cart = await prisma.cart.create({ data: { userId: user.id } });
  await prisma.cartItem.create({
    data: { cartId: cart.id, productId: product.id, quantity: 1 },
  });
  return { user, product, cart };
}

function checkoutService(repository: PrismaCheckoutRepository) {
  return new CheckoutService(
    repository,
    new PrismaCheckoutUnitOfWork(),
    new PricingService({ isEnabled: () => true }),
    new StockReservationService(noopTracer, noopMetrics),
    { generate: () => "T2-" + randomUUID() },
    noopTracer,
    noopMetrics,
  );
}

describe("Checkout recovery and pricing consistency (real PostgreSQL, T2)", () => {
  it("quotes without side effects and rolls stock/discount usage back when the reviewed total changes", async () => {
    const { user, product, cart } = await seededCart();
    const discount = await prisma.discount.create({
      data: {
        code: "QUOTE-" + randomUUID(),
        type: "PERCENTAGE",
        value: 10,
        maxUses: 2,
        isActive: true,
      },
    });
    const service = checkoutService(new PrismaCheckoutRepository());
    const firstQuote = await service.quote(user.id, discount.code);
    expect(firstQuote.total).toBe(31000);
    await service.quote(user.id, discount.code);
    expect(
      (await prisma.discount.findUniqueOrThrow({ where: { id: discount.id } }))
        .usedCount,
    ).toBe(0);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
        .stock,
    ).toBe(5);

    await prisma.product.update({
      where: { id: product.id },
      data: { price: 1200, version: { increment: 1 } },
    });
    const input = {
      idempotencyKey: "quote-review-" + randomUUID(),
      paymentMethod: "COD" as const,
      address: "Synthetic test address",
      phone: "0000000000",
      discountCode: discount.code,
      expectedTotal: firstQuote.total,
    };
    await expect(service.checkout(user.id, input)).rejects.toThrow(
      /total changed/,
    );
    const [stock, usage, orders, cartItems] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.discount.findUniqueOrThrow({ where: { id: discount.id } }),
      prisma.order.count({ where: { userId: user.id } }),
      prisma.cartItem.count({ where: { cartId: cart.id } }),
    ]);
    expect(stock.stock).toBe(5);
    expect(stock.version).toBe(1);
    expect(usage.usedCount).toBe(0);
    expect(orders).toBe(0);
    expect(cartItems).toBe(1);

    const updatedQuote = await service.quote(user.id, discount.code);
    const placed = await service.checkout(user.id, {
      ...input,
      expectedTotal: updatedQuote.total,
    });
    expect(placed.order.total).toBe(updatedQuote.total);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
        .stock,
    ).toBe(4);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    expect(
      (await prisma.discount.findUniqueOrThrow({ where: { id: discount.id } }))
        .usedCount,
    ).toBe(1);
  });

  it("recovers a committed order after a lost client response without charging stock twice", async () => {
    const { user, product, cart } = await seededCart();
    const service = checkoutService(new PrismaCheckoutRepository());
    const request = {
      idempotencyKey: "t2-lost-response-" + randomUUID(),
      paymentMethod: "COD" as const,
      address: "Test address",
      phone: "0123456789",
    };

    const first = await service.checkout(user.id, request);
    expect(first.idempotent).toBe(false);

    // Simulate a client that never received the first HTTP response.
    const retried = await service.checkout(user.id, request);
    expect(retried.idempotent).toBe(true);
    expect(retried.order.id).toBe(first.order.id);
    expect(retried.order.orderNumber).toBe(first.order.orderNumber);

    const [orders, productAfter, remainingCartItems] = await Promise.all([
      prisma.order.count({ where: { userId: user.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.cartItem.count({ where: { cartId: cart.id } }),
    ]);
    expect(orders).toBe(1);
    expect(productAfter.stock).toBe(4);
    expect(productAfter.version).toBe(1);
    expect(remainingCartItems).toBe(0);
  });

  it("charges the locked database price rather than a stale cart snapshot", async () => {
    const { user, product } = await seededCart();
    const repository = new PrismaCheckoutRepository();
    const originalRead = repository.findUserCartForCheckout.bind(repository);

    repository.findUserCartForCheckout = async (userId) => {
      // Snapshot is read at 1,000 before an administrator changes the price.
      const staleCart = await originalRead(userId);
      expect(staleCart?.cart?.items[0].product.price).toBe(1000);

      await prisma.product.update({
        where: { id: product.id },
        data: { price: "1200", version: { increment: 1 } },
      });
      return staleCart;
    };

    const result = await checkoutService(repository).checkout(user.id, {
      idempotencyKey: "t2-current-price-" + randomUUID(),
      paymentMethod: "COD",
      address: "Test address",
      phone: "0123456789",
    });

    expect(result.idempotent).toBe(false);
    expect(result.order.subtotal).toBe(1200);
    expect(result.order.items[0].price).toBe(1200);
    expect(result.order.items[0].total).toBe(1200);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(after.stock).toBe(4);
    expect(after.version).toBe(2);
  });
  it("allows two concurrent retries with one key to persist at most one order and stock change", async () => {
    const { user, product, cart } = await seededCart();
    const request = {
      idempotencyKey: "t2-concurrent-" + randomUUID(),
      paymentMethod: "COD" as const,
      address: "Test address",
      phone: "0123456789",
    };
    const service = checkoutService(new PrismaCheckoutRepository());
    const concurrent = await Promise.allSettled([
      service.checkout(user.id, request),
      service.checkout(user.id, request),
    ]);

    const completed = concurrent.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.checkout>>
      > => result.status === "fulfilled",
    );
    // If a request loses the serialization race, its client may retry.
    // The durable effect must still be exactly one order and one decrement.
    const recovered = await service.checkout(user.id, request);
    expect(recovered.idempotent).toBe(true);
    expect(completed.length).toBeGreaterThanOrEqual(1);
    for (const result of completed) {
      expect(result.value.order.id).toBe(recovered.order.id);
    }

    const [orders, stock, cartItems] = await Promise.all([
      prisma.order.findMany({ where: { userId: user.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.cartItem.count({ where: { cartId: cart.id } }),
    ]);
    expect(orders).toHaveLength(1);
    expect(orders[0].idempotencyKey).toBe(request.idempotencyKey);
    expect(stock.stock).toBe(4);
    expect(stock.version).toBe(1);
    expect(cartItems).toBe(0);
  }, 30_000);
});
