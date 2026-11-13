import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import prisma from "@core/database/prisma";
import { persistEvents } from "@core/outbox/persist-domain-events";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { Order } from "@modules/orders/domain/order.entity";
import type {
  CheckoutTransaction,
  CheckoutUnitOfWork,
} from "@modules/checkout/application/ports/checkout-transaction";
import {
  ConflictError,
  RetryableConflictError,
} from "@shared/errors/application-error";
import { Money } from "@shared/value-objects/money";
import { PricingService } from "@modules/checkout/services/pricing.service";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { noopMetrics, noopTracer } from "../helpers/observability";

async function seededCart() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `integrity-${suffix}@example.invalid`,
      password: "unused",
      firstName: "Integrity",
      lastName: "Test",
      isVerified: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Integrity Product",
      description: "Transaction integrity fixture",
      slug: `integrity-${suffix}`,
      category: "test",
      price: 1000,
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

function createCheckoutService(unitOfWork: CheckoutUnitOfWork) {
  return new CheckoutService(
    new PrismaCheckoutRepository(),
    unitOfWork,
    new PricingService({ isEnabled: () => true }),
    new StockReservationService(noopTracer, noopMetrics),
    { generate: () => `INTEGRITY-${randomUUID().slice(0, 8)}` },
    noopTracer,
    noopMetrics,
  );
}

function checkoutInput(idempotencyKey = randomUUID()) {
  return {
    idempotencyKey,
    paymentMethod: "COD" as const,
    address: "Test address",
    phone: "0123456789",
  };
}

class ConflictAfterWorkUnitOfWork implements CheckoutUnitOfWork {
  private attempts = 0;

  constructor(private readonly failures: number) {}

  get attemptCount() {
    return this.attempts;
  }

  async run<T>(
    work: (transaction: CheckoutTransaction) => Promise<T>,
  ): Promise<T> {
    this.attempts += 1;
    return new PrismaCheckoutUnitOfWork().run(async (tx) => {
      const result = await work(tx);
      if (this.attempts <= this.failures) {
        throw new RetryableConflictError(
          "Injected transaction conflict",
          "transaction_conflict",
        );
      }
      return result;
    });
  }
}

describe("Checkout transaction integrity (isolated PostgreSQL)", () => {
  it("rolls back stock, order, and outbox when a conflict occurs before commit", async () => {
    const { user, product } = await seededCart();
    const orderId = `integrity-order-${randomUUID()}`;
    const orderNumber = `INTEGRITY-${randomUUID().slice(0, 8)}`;
    const order = Order.create({
      id: orderId,
      userId: user.id,
      orderNumber,
      customerName: "Integrity Test",
      customerEmail: user.email,
      customerPhone: "0123456789",
      customerAddress: "Test address",
      paymentMethod: "COD",
    });
    order.addItem(product.id, product.name, 1, new Money(1000));
    order.place();

    const unitOfWork = new PrismaCheckoutUnitOfWork();
    await expect(
      unitOfWork.run(async (tx) => {
        const locked = await tx.lockProductsForUpdate([product.id]);
        expect(locked[0].stock).toBe(5);
        expect(await tx.decrementProductStock(product.id, 0, 1)).toBe(true);
        await tx.saveNewOrder(order);
        throw new ConflictError("Injected conflict before commit");
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const [storedProduct, orders, events] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.order.count({ where: { id: orderId } }),
      prisma.outboxEvent.count({ where: { aggregateId: orderId } }),
    ]);
    expect(storedProduct).toMatchObject({ stock: 5, version: 0 });
    expect(orders).toBe(0);
    expect(events).toBe(0);
  });

  it("retries transient conflicts and commits exactly one checkout", async () => {
    const { user, product, cart } = await seededCart();
    const unitOfWork = new ConflictAfterWorkUnitOfWork(2);
    const service = createCheckoutService(unitOfWork);

    const result = await service.checkout(user.id, checkoutInput());
    const [storedProduct, orders, orderEvents, productEvents, cartItems] =
      await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
        prisma.order.count({ where: { userId: user.id } }),
        prisma.outboxEvent.count({
          where: { aggregateId: result.order.id, eventName: "OrderPlaced" },
        }),
        prisma.outboxEvent.count({
          where: { aggregateId: product.id, eventName: "ProductUpdated" },
        }),
        prisma.cartItem.count({ where: { cartId: cart.id } }),
      ]);

    expect(unitOfWork.attemptCount).toBe(3);
    expect(storedProduct).toMatchObject({ stock: 4, version: 1 });
    expect(orders).toBe(1);
    expect(orderEvents).toBe(1);
    expect(productEvents).toBe(1);
    expect(cartItems).toBe(0);
  });

  it("returns an application conflict after retry exhaustion without partial state", async () => {
    const { user, product, cart } = await seededCart();
    const unitOfWork = new ConflictAfterWorkUnitOfWork(
      Number.POSITIVE_INFINITY,
    );
    const service = createCheckoutService(unitOfWork);

    await expect(
      service.checkout(user.id, checkoutInput()),
    ).rejects.toMatchObject({
      code: "APPLICATION.CONFLICT",
    });

    const [storedProduct, orders, events, cartItems] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.order.count({ where: { userId: user.id } }),
      prisma.outboxEvent.count({
        where: { aggregateId: product.id },
      }),
      prisma.cartItem.count({ where: { cartId: cart.id } }),
    ]);
    expect(unitOfWork.attemptCount).toBe(6);
    expect(storedProduct).toMatchObject({ stock: 5, version: 0 });
    expect(orders).toBe(0);
    expect(events).toBe(0);
    expect(cartItems).toBe(1);
  }, 30_000);

  it("rolls back order and stock when outbox persistence conflicts", async () => {
    const { user, product, cart } = await seededCart();
    const secondProduct = await prisma.product.create({
      data: {
        name: "Second Integrity Product",
        description: "Transaction integrity fixture",
        slug: `integrity-second-${randomUUID()}`,
        category: "test",
        price: 1000,
        stock: 7,
        images: [],
      },
    });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: secondProduct.id, quantity: 2 },
    });
    const unitOfWork = new PrismaCheckoutUnitOfWork(
      async (tx, events, sourceVersions) => {
        if (events.some((event) => event.eventName === "ProductUpdated")) {
          throw new ConflictError("Injected outbox conflict");
        }
        await persistEvents(tx, events, sourceVersions);
      },
    );
    const service = createCheckoutService(unitOfWork);

    await expect(
      service.checkout(user.id, checkoutInput()),
    ).rejects.toBeInstanceOf(ConflictError);

    const [storedProduct, storedSecondProduct, orders, events, cartItems] =
      await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: secondProduct.id } }),
        prisma.order.count({ where: { userId: user.id } }),
        prisma.outboxEvent.count({
          where: {
            aggregateId: { in: [product.id, secondProduct.id] },
          },
        }),
        prisma.cartItem.count({ where: { cartId: cart.id } }),
      ]);
    expect(storedProduct).toMatchObject({ stock: 5, version: 0 });
    expect(storedSecondProduct).toMatchObject({ stock: 7, version: 0 });
    expect(orders).toBe(0);
    expect(events).toBe(0);
    expect(cartItems).toBe(2);
  }, 30_000);

  it("does not duplicate effects when the same key is retried after a transaction conflict", async () => {
    const { user, product } = await seededCart();
    const unitOfWork = new ConflictAfterWorkUnitOfWork(2);
    const service = createCheckoutService(unitOfWork);
    const request = checkoutInput();

    const first = await service.checkout(user.id, request);
    const second = await service.checkout(user.id, request);

    const [storedProduct, orders, orderEvents, productEvents] =
      await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
        prisma.order.count({ where: { userId: user.id } }),
        prisma.outboxEvent.count({
          where: { aggregateId: first.order.id, eventName: "OrderPlaced" },
        }),
        prisma.outboxEvent.count({
          where: { aggregateId: product.id, eventName: "ProductUpdated" },
        }),
      ]);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(storedProduct).toMatchObject({ stock: 4, version: 1 });
    expect(orders).toBe(1);
    expect(orderEvents).toBe(1);
    expect(productEvents).toBe(1);
  });
});
