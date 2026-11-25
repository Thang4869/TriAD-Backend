import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import prisma from "@core/database/prisma";
import {
  persistDomainEvents,
  persistEvents,
} from "@core/outbox/persist-domain-events";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { IdempotencyConflictError } from "@modules/checkout/application/errors/idempotency-conflict.error";
import { RetryableConflictError } from "@shared/errors/application-error";
import type { Order } from "@modules/orders/domain/order.entity";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  persistEvents: vi.fn(),
  persistDomainEvents: vi.fn(),
  logger: { warn: vi.fn() },
}));

vi.mock("@core/database/prisma", () => ({ default: mocks.prisma }));
vi.mock("@core/outbox/persist-domain-events", () => ({
  persistEvents: mocks.persistEvents,
  persistDomainEvents: mocks.persistDomainEvents,
}));
vi.mock("@core/logger/winston", () => ({ logger: mocks.logger }));

const savedOrder = {
  id: "order-1",
  orderNumber: "ORD-2026-0001",
  userId: "user-1",
  status: "PENDING",
  paymentMethod: "COD",
  paymentStatus: "PENDING",
  subtotal: 2000,
  tax: 100,
  shippingFee: 50,
  total: 2150,
  discountAmount: 0,
  discountCode: null,
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "0123456789",
  customerAddress: "1 Main Street",
  notes: null,
  idempotencyKey: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  version: 1,
};

function makeTransaction() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    discount: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    cartItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    order: { create: vi.fn().mockResolvedValue(savedOrder) },
    orderItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

function makeOrder() {
  const money = (value: number) => ({ getValue: () => value });
  return {
    id: "order-1",
    orderNumber: "ORD-2026-0001",
    userId: "user-1",
    status: "PENDING",
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    subtotal: money(2000),
    tax: money(100),
    shippingFee: money(50),
    total: money(2150),
    discountAmount: money(0),
    discountCode: undefined,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "0123456789",
    customerAddress: "1 Main Street",
    notes: undefined,
    items: [
      {
        productId: "product-1",
        quantity: 2,
        unitPrice: money(1000),
        total: money(2000),
      },
    ],
  } as unknown as Order;
}

async function runWithTransaction<T>(
  tx: ReturnType<typeof makeTransaction>,
  work: Parameters<PrismaCheckoutUnitOfWork["run"]>[0],
  unitOfWork = new PrismaCheckoutUnitOfWork(),
): Promise<T> {
  vi.mocked(prisma.$transaction).mockImplementationOnce((async (
    callback: (transaction: unknown) => Promise<unknown>,
  ) => callback(tx)) as typeof prisma.$transaction);
  return unitOfWork.run(work) as Promise<T>;
}

function uniqueConflict(target: string | string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("PrismaCheckoutUnitOfWork transaction adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockResolvedValue("ok");
    mocks.persistEvents.mockResolvedValue(undefined);
    mocks.persistDomainEvents.mockResolvedValue(undefined);
  });

  it("passes the transaction timeout and configured isolation level", async () => {
    await expect(
      new PrismaCheckoutUnitOfWork(
        undefined,
        undefined,
        Prisma.TransactionIsolationLevel.Serializable,
      ).run(async () => "result"),
    ).resolves.toBe("ok");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10_000,
    });
  });

  it("locks products and converts persisted prices to safe integers", async () => {
    const tx = makeTransaction();
    tx.$queryRaw.mockResolvedValue([
      {
        id: "product-1",
        name: "Shirt",
        price: "125000",
        stock: 4,
        version: 2,
        isActive: true,
      },
    ]);

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.lockProductsForUpdate(["product-1"]),
      ),
    ).resolves.toEqual([
      {
        id: "product-1",
        name: "Shirt",
        price: 125000,
        stock: 4,
        version: 2,
        isActive: true,
      },
    ]);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it("returns an empty locked-product list when the query finds no rows", async () => {
    const tx = makeTransaction();
    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.lockProductsForUpdate([]),
      ),
    ).resolves.toEqual([]);
  });

  it("decrements stock only when the product version still matches", async () => {
    const tx = makeTransaction();

    await expect(
      runWithTransaction(tx, async (transaction) => {
        const updated = await transaction.decrementProductStock(
          "product-1",
          2,
          3,
        );
        tx.product.updateMany.mockResolvedValueOnce({ count: 0 });
        const stale = await transaction.decrementProductStock(
          "product-1",
          1,
          3,
        );
        return [updated, stale];
      }),
    ).resolves.toEqual([true, false]);

    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "product-1", version: 2 },
      data: { stock: { decrement: 3 }, version: { increment: 1 } },
    });
  });

  it("persists product events and observes the outbox stage duration", async () => {
    const tx = makeTransaction();
    const events = [{ eventName: "ProductUpdated" }] as never[];
    const versions = new Map([["product-1", 3]]);
    const observe = vi.fn();
    const unitOfWork = new PrismaCheckoutUnitOfWork(mocks.persistEvents, {
      observe,
    } as never);

    await runWithTransaction(
      tx,
      (transaction) => transaction.persistProductEvents(events, versions),
      unitOfWork,
    );

    expect(persistEvents).toHaveBeenCalledWith(tx, events, versions);
    expect(observe).toHaveBeenCalledWith(
      "checkout.stage.duration",
      expect.any(Number),
      { stage: "product_outbox" },
    );
  });

  it("observes product outbox duration even when event persistence fails", async () => {
    const tx = makeTransaction();
    const error = new Error("outbox unavailable");
    const persist = vi.fn().mockRejectedValue(error);
    const observe = vi.fn();
    const unitOfWork = new PrismaCheckoutUnitOfWork(persist, {
      observe,
    } as never);

    await expect(
      runWithTransaction(
        tx,
        (transaction) => transaction.persistProductEvents([], new Map()),
        unitOfWork,
      ),
    ).rejects.toBe(error);

    expect(observe).toHaveBeenCalledWith(
      "checkout.stage.duration",
      expect.any(Number),
      { stage: "product_outbox" },
    );
  });

  it("returns null when a discount code is not found", async () => {
    const tx = makeTransaction();
    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.findDiscountByCode("MISSING"),
      ),
    ).resolves.toBeNull();
  });

  it("converts discount value and minimum order amount", async () => {
    const tx = makeTransaction();
    tx.discount.findUnique.mockResolvedValue({
      id: "discount-1",
      code: "SAVE10",
      isActive: true,
      expiresAt: null,
      minOrderAmount: "1000",
      maxUses: 20,
      usedCount: 3,
      type: "PERCENTAGE",
      value: "10",
    });

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.findDiscountByCode("SAVE10"),
      ),
    ).resolves.toMatchObject({
      id: "discount-1",
      value: 10,
      minOrderAmount: 1000,
    });
  });

  it("preserves a null minimum order amount", async () => {
    const tx = makeTransaction();
    tx.discount.findUnique.mockResolvedValue({
      id: "discount-1",
      code: "SAVE10",
      isActive: true,
      expiresAt: null,
      minOrderAmount: null,
      maxUses: null,
      usedCount: 0,
      type: "PERCENTAGE",
      value: 10,
    });

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.findDiscountByCode("SAVE10"),
      ),
    ).resolves.toMatchObject({ minOrderAmount: null });
  });

  it("increments discount usage with a maximum-use guard", async () => {
    const tx = makeTransaction();

    await expect(
      runWithTransaction(tx, async (transaction) => {
        const limited = await transaction.incrementDiscountUsage(
          "discount-1",
          10,
        );
        tx.discount.updateMany.mockResolvedValueOnce({ count: 0 });
        const exhausted = await transaction.incrementDiscountUsage(
          "discount-1",
          10,
        );
        return [limited, exhausted];
      }),
    ).resolves.toEqual([true, false]);

    expect(tx.discount.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "discount-1", usedCount: { lt: 10 } },
      data: { usedCount: { increment: 1 } },
    });
  });

  it("increments discount usage without a maximum-use condition", async () => {
    const tx = makeTransaction();

    await runWithTransaction(tx, (transaction) =>
      transaction.incrementDiscountUsage("discount-1", null),
    );

    expect(tx.discount.updateMany).toHaveBeenCalledWith({
      where: { id: "discount-1" },
      data: { usedCount: { increment: 1 } },
    });
  });

  it("clears cart items for the specified cart", async () => {
    const tx = makeTransaction();

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.clearCartItems("cart-1"),
      ),
    ).resolves.toBeUndefined();

    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: "cart-1" },
    });
  });

  it("persists an order, its items and domain events in one transaction", async () => {
    const tx = makeTransaction();
    const observe = vi.fn();
    const unitOfWork = new PrismaCheckoutUnitOfWork(mocks.persistEvents, {
      observe,
    } as never);

    const order = makeOrder();
    await expect(
      runWithTransaction(
        tx,
        (transaction) => transaction.saveNewOrder(order, "checkout-key"),
        unitOfWork,
      ),
    ).resolves.toEqual({
      ...savedOrder,
      subtotal: 2000,
      tax: 100,
      shippingFee: 50,
      total: 2150,
      discountAmount: 0,
    });

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "order-1",
        orderNumber: "ORD-2026-0001",
        idempotencyKey: "checkout-key",
        subtotal: 2000,
        total: 2150,
      }),
    });
    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          orderId: "order-1",
          productId: "product-1",
          quantity: 2,
          price: 1000,
          total: 2000,
        },
      ],
    });
    expect(persistDomainEvents).toHaveBeenCalledWith(
      tx,
      [order],
      new Map([["order-1", 0]]),
    );
    expect(observe).toHaveBeenCalledWith(
      "checkout.stage.duration",
      expect.any(Number),
      { stage: "order_persistence" },
    );
    expect(observe).toHaveBeenCalledWith(
      "checkout.stage.duration",
      expect.any(Number),
      { stage: "order_outbox" },
    );
  });

  it("omits the idempotency key when no key is supplied", async () => {
    const tx = makeTransaction();

    await runWithTransaction(tx, (transaction) =>
      transaction.saveNewOrder(makeOrder()),
    );

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    });
  });

  it.each([
    ["array", ["idempotencyKey", "userId"]],
    ["string", "orders.idempotencyKey"],
  ])(
    "translates a duplicate idempotency key reported as %s metadata",
    async (_kind, target) => {
      const tx = makeTransaction();
      const conflict = uniqueConflict(target as string | string[]);
      tx.order.create.mockRejectedValueOnce(conflict);

      await expect(
        runWithTransaction(tx, (transaction) =>
          transaction.saveNewOrder(makeOrder(), "duplicate-key"),
        ),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      expect(tx.orderItem.createMany).not.toHaveBeenCalled();
      expect(persistDomainEvents).not.toHaveBeenCalled();
    },
  );

  it("rethrows a unique conflict unrelated to the idempotency key", async () => {
    const tx = makeTransaction();
    const conflict = uniqueConflict(["orderNumber"]);
    tx.order.create.mockRejectedValueOnce(conflict);

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.saveNewOrder(makeOrder(), "checkout-key"),
      ),
    ).rejects.toBe(conflict);
  });

  it("rethrows a P2002 error when its metadata target has an unsupported shape", async () => {
    const tx = makeTransaction();
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test", meta: { target: 42 } },
    );
    tx.order.create.mockRejectedValueOnce(conflict);

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.saveNewOrder(makeOrder(), "checkout-key"),
      ),
    ).rejects.toBe(conflict);
  });

  it("rethrows non-unique order creation errors unchanged", async () => {
    const tx = makeTransaction();
    const error = new Error("database unavailable");
    tx.order.create.mockRejectedValueOnce(error);

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.saveNewOrder(makeOrder(), "checkout-key"),
      ),
    ).rejects.toBe(error);
  });

  it("does not persist domain events when order-item persistence fails", async () => {
    const tx = makeTransaction();
    const error = new Error("order items unavailable");
    tx.orderItem.createMany.mockRejectedValueOnce(error);

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.saveNewOrder(makeOrder()),
      ),
    ).rejects.toBe(error);

    expect(persistDomainEvents).not.toHaveBeenCalled();
  });

  it("rethrows an outbox failure after persisting the order", async () => {
    const tx = makeTransaction();
    const error = new Error("outbox unavailable");
    mocks.persistDomainEvents.mockRejectedValueOnce(error);

    await expect(
      runWithTransaction(tx, (transaction) =>
        transaction.saveNewOrder(makeOrder()),
      ),
    ).rejects.toBe(error);

    expect(tx.order.create).toHaveBeenCalledOnce();
    expect(tx.orderItem.createMany).toHaveBeenCalledOnce();
  });

  it("keeps checkout successful when stage metrics throw", async () => {
    const tx = makeTransaction();
    const observe = vi.fn(() => {
      throw new Error("metrics unavailable");
    });
    const unitOfWork = new PrismaCheckoutUnitOfWork(mocks.persistEvents, {
      observe,
    } as never);

    await expect(
      runWithTransaction(
        tx,
        (transaction) => transaction.saveNewOrder(makeOrder()),
        unitOfWork,
      ),
    ).resolves.toMatchObject({ id: "order-1" });

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Checkout stage metrics observation failed",
      { stage: "order_persistence" },
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Checkout stage metrics observation failed",
      { stage: "order_outbox" },
    );
  });

  it("keeps transaction results successful when transaction metrics throw", async () => {
    const observe = vi.fn(() => {
      throw new Error("metrics unavailable");
    });
    const unitOfWork = new PrismaCheckoutUnitOfWork(mocks.persistEvents, {
      observe,
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce("ok");

    await expect(unitOfWork.run(async () => "ok")).resolves.toBe("ok");
    expect(observe).toHaveBeenCalledWith(
      "checkout.stage.duration",
      expect.any(Number),
      { stage: "transaction" },
    );
  });

  it("wraps serialization conflicts in a retryable application error", async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Serialization conflict",
      { code: "P2034", clientVersion: "test" },
    );
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(error);

    await expect(
      new PrismaCheckoutUnitOfWork().run(async () => "never"),
    ).rejects.toBeInstanceOf(RetryableConflictError);
  });
});
