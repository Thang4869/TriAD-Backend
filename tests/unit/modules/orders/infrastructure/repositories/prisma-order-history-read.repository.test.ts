import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    orderHistoryProjection: {
      findMany: mocks.findMany,
      count: mocks.count,
      findFirst: mocks.findFirst,
    },
  },
}));

import { PrismaOrderHistoryReadRepository } from "@modules/orders/infrastructure/repositories/prisma-order-history-read.repository";

const row = {
  orderId: "order-1",
  userId: "user-1",
  orderNumber: "ORD-1",
  status: "DELIVERED",
  paymentStatus: "PAID",
  subtotal: 100,
  tax: 5,
  shippingFee: 10,
  total: 115,
  items: [
    {
      productId: "product-1",
      productName: "Shirt",
      quantity: 2,
      unitPrice: 50,
    },
  ],
  placedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("PrismaOrderHistoryReadRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.findFirst.mockResolvedValue(null);
  });

  it("maps user order history and converts monetary values", async () => {
    mocks.findMany.mockResolvedValue([row]);
    const result = await new PrismaOrderHistoryReadRepository().findByUser(
      "user-1",
      10,
      5,
    );
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { placedAt: "desc" },
      skip: 10,
      take: 5,
    });
    expect(result[0]).toMatchObject({
      orderId: "order-1",
      subtotal: 100,
      tax: 5,
      shippingFee: 10,
      total: 115,
      items: [
        {
          productId: "product-1",
          productName: "Shirt",
          quantity: 2,
          unitPrice: 50,
        },
      ],
    });
  });

  it("counts a user's order history", async () => {
    mocks.count.mockResolvedValue(4);
    await expect(
      new PrismaOrderHistoryReadRepository().countByUser("user-1"),
    ).resolves.toBe(4);
    expect(mocks.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("returns null when the requested order is not in the user's history", async () => {
    await expect(
      new PrismaOrderHistoryReadRepository().findByIdAndUser(
        "order-1",
        "user-2",
      ),
    ).resolves.toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { orderId: "order-1", userId: "user-2" },
    });
  });

  it("maps a matching order history projection", async () => {
    mocks.findFirst.mockResolvedValue(row);
    await expect(
      new PrismaOrderHistoryReadRepository().findByIdAndUser(
        "order-1",
        "user-1",
      ),
    ).resolves.toMatchObject({
      orderId: "order-1",
      total: 115,
      items: [{ productId: "product-1" }],
    });
  });

  it("rejects invalid persisted projection items instead of exposing malformed data", async () => {
    mocks.findFirst.mockResolvedValue({
      ...row,
      items: [{ productId: "", quantity: 0 }],
    });
    await expect(
      new PrismaOrderHistoryReadRepository().findByIdAndUser(
        "order-1",
        "user-1",
      ),
    ).rejects.toThrow("Invalid order history projection items");
  });
});
