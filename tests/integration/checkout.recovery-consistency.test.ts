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
});
