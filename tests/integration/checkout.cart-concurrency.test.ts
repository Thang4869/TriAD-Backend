import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import prisma from "@core/database/prisma";
import { CheckoutService } from "@modules/checkout/checkout.service";
import type { CheckoutUnitOfWork } from "@modules/checkout/application/ports/checkout-transaction";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { PricingService } from "@modules/checkout/services/pricing.service";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { noopMetrics, noopTracer } from "../helpers/observability";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function createFixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `cart-race-${suffix}@example.invalid`,
      password: "unused",
      firstName: "Cart",
      lastName: "Concurrency",
      isVerified: true,
    },
  });
  const firstProduct = await prisma.product.create({
    data: {
      name: "Checkout Snapshot Product",
      description: "Cart snapshot concurrency fixture",
      slug: `cart-snapshot-${suffix}`,
      category: "test",
      price: 1000,
      stock: 5,
      images: [],
    },
  });
  const lateProduct = await prisma.product.create({
    data: {
      name: "Late Cart Product",
      description: "Product added after checkout locks the cart",
      slug: `cart-late-${suffix}`,
      category: "test",
      price: 2000,
      stock: 7,
      images: [],
    },
  });
  const cart = await prisma.cart.create({ data: { userId: user.id } });
  await prisma.cartItem.create({
    data: { cartId: cart.id, productId: firstProduct.id, quantity: 1 },
  });

  return { user, cart, firstProduct, lateProduct };
}

function createCheckoutService(unitOfWork: CheckoutUnitOfWork) {
  return new CheckoutService(
    new PrismaCheckoutRepository(),
    unitOfWork,
    new PricingService({ isEnabled: () => true }),
    new StockReservationService(noopTracer, noopMetrics),
    { generate: () => `CART-RACE-${randomUUID().slice(0, 8)}` },
    noopTracer,
    noopMetrics,
  );
}

function checkoutInput() {
  return {
    idempotencyKey: randomUUID(),
    paymentMethod: "COD" as const,
    address: "Concurrency test address",
    phone: "0123456789",
  };
}

class PausedCartLockUnitOfWork implements CheckoutUnitOfWork {
  private readonly unitOfWork = new PrismaCheckoutUnitOfWork();

  constructor(
    private readonly userId: string,
    private readonly onLocked: () => void,
    private readonly continueCheckout: Promise<void>,
  ) {}

  run<T>(work: Parameters<CheckoutUnitOfWork["run"]>[0]): Promise<T> {
    return this.unitOfWork.run(async (tx) => {
      const cart = await tx.lockCartForCheckout(this.userId);
      expect(cart).not.toBeNull();
      this.onLocked();
      await this.continueCheckout;
      return work(tx) as Promise<T>;
    });
  }
}

describe("Checkout cart concurrency (isolated PostgreSQL)", () => {
  it("includes items added before checkout acquires the cart lock", async () => {
    const { user, cart, firstProduct, lateProduct } = await createFixture();
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: lateProduct.id, quantity: 2 },
    });

    const service = createCheckoutService(new PrismaCheckoutUnitOfWork());
    const result = await service.checkout(user.id, checkoutInput());

    expect(result.order.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: firstProduct.id, quantity: 1 }),
        expect.objectContaining({ productId: lateProduct.id, quantity: 2 }),
      ]),
    );
    expect(result.order.items).toHaveLength(2);

    const [firstStored, lateStored, remainingItems, orderItems] =
      await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: firstProduct.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: lateProduct.id } }),
        prisma.cartItem.count({ where: { cartId: cart.id } }),
        prisma.orderItem.count({ where: { orderId: result.order.id } }),
      ]);

    expect(firstStored).toMatchObject({ stock: 4, version: 1 });
    expect(lateStored).toMatchObject({ stock: 5, version: 1 });
    expect(remainingItems).toBe(0);
    expect(orderItems).toBe(2);
  });

  it("preserves an item inserted after checkout has locked the cart", async () => {
    const { user, cart, firstProduct, lateProduct } = await createFixture();
    const locked = deferred();
    const resume = deferred();
    const unitOfWork = new PausedCartLockUnitOfWork(
      user.id,
      locked.resolve,
      resume.promise,
    );
    const service = createCheckoutService(unitOfWork);
    const checkoutPromise = service.checkout(user.id, checkoutInput());

    await locked.promise;
    let insertionCompleted = false;
    const insertionPromise = prisma.cartItem
      .create({
        data: { cartId: cart.id, productId: lateProduct.id, quantity: 2 },
      })
      .then((item) => {
        insertionCompleted = true;
        return item;
      });

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(insertionCompleted).toBe(false);
    } finally {
      resume.resolve();
    }

    const result = await checkoutPromise;
    const insertedItem = await insertionPromise;
    const [firstStored, lateStored, remainingItems, orderItems] =
      await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: firstProduct.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: lateProduct.id } }),
        prisma.cartItem.findMany({ where: { cartId: cart.id } }),
        prisma.orderItem.findMany({ where: { orderId: result.order.id } }),
      ]);

    expect(result.order.items).toHaveLength(1);
    expect(result.order.items[0]).toMatchObject({
      productId: firstProduct.id,
      quantity: 1,
    });
    expect(remainingItems).toEqual([
      expect.objectContaining({
        id: insertedItem.id,
        productId: lateProduct.id,
        quantity: 2,
      }),
    ]);
    expect(orderItems).toHaveLength(1);
    expect(firstStored).toMatchObject({ stock: 4, version: 1 });
    expect(lateStored).toMatchObject({ stock: 7, version: 0 });
  });
});
