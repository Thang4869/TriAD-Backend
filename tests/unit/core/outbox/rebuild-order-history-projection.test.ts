import { beforeEach, describe, expect, it, vi } from "vitest";
import { rebuildOrderHistoryProjection } from "@core/outbox/rebuild-order-history-projection";

describe("rebuildOrderHistoryProjection", () => {
  const findMany = vi.fn();
  const upsert = vi.fn();
  const transaction = vi.fn();

  const db = {
    order: {
      findMany,
    },
    orderHistoryProjection: {
      upsert,
    },
    $transaction: transaction,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    upsert.mockImplementation((args) => args);
    transaction.mockResolvedValue([]);
  });

  it("rebuilds projection from the order source of truth", async () => {
    const createdAt = new Date("2026-09-28T10:00:00.000Z");

    findMany
      .mockResolvedValueOnce([
        {
          id: "order-1",
          userId: "user-1",
          orderNumber: "ORD-001",
          status: "DELIVERED",
          paymentStatus: "PAID",
          subtotal: 200,
          tax: 20,
          shippingFee: 30,
          total: 240,
          createdAt,
          items: [
            {
              productId: "product-1",
              quantity: 2,
              price: 100,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    const processed = await rebuildOrderHistoryProjection(db as never);

    expect(processed).toBe(1);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        orderId: "order-1",
      },
      create: {
        orderId: "order-1",
        userId: "user-1",
        orderNumber: "ORD-001",
        status: "DELIVERED",
        paymentStatus: "PAID",
        subtotal: 200,
        tax: 20,
        shippingFee: 30,
        total: 240,
        items: [
          {
            productId: "product-1",
            quantity: 2,
            unitPrice: 100,
          },
        ],
        placedAt: createdAt,
      },
      update: {
        userId: "user-1",
        orderNumber: "ORD-001",
        status: "DELIVERED",
        paymentStatus: "PAID",
        subtotal: 200,
        tax: 20,
        shippingFee: 30,
        total: 240,
        items: [
          {
            productId: "product-1",
            quantity: 2,
            unitPrice: 100,
          },
        ],
        placedAt: createdAt,
      },
    });

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("processes multiple batches using the last order as cursor", async () => {
    const createdAt = new Date("2026-09-28T10:00:00.000Z");

    const createOrder = (id: string) => ({
      id,
      userId: "user-1",
      orderNumber: `ORD-${id}`,
      status: "PENDING",
      paymentStatus: "PENDING",
      subtotal: 100,
      tax: 0,
      shippingFee: 30,
      total: 130,
      createdAt,
      items: [],
    });

    findMany
      .mockResolvedValueOnce([createOrder("order-1"), createOrder("order-2")])
      .mockResolvedValueOnce([createOrder("order-3")])
      .mockResolvedValueOnce([]);

    const processed = await rebuildOrderHistoryProjection(db as never, 2);

    expect(processed).toBe(3);
    expect(transaction).toHaveBeenCalledTimes(2);

    expect(findMany).toHaveBeenNthCalledWith(1, {
      take: 2,
      orderBy: { id: "asc" },
      include: {
        items: true,
      },
    });

    expect(findMany).toHaveBeenNthCalledWith(2, {
      take: 2,
      skip: 1,
      cursor: {
        id: "order-2",
      },
      orderBy: { id: "asc" },
      include: {
        items: true,
      },
    });

    expect(findMany).toHaveBeenNthCalledWith(3, {
      take: 2,
      skip: 1,
      cursor: {
        id: "order-3",
      },
      orderBy: { id: "asc" },
      include: {
        items: true,
      },
    });
  });

  it("does nothing when there are no orders", async () => {
    findMany.mockResolvedValueOnce([]);

    const processed = await rebuildOrderHistoryProjection(db as never);

    expect(processed).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
