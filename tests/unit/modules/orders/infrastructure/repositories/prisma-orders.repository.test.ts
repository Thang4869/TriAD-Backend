import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaOrdersRepository } from "@modules/orders/infrastructure/repositories/prisma-orders.repository";
import { ConflictError } from "@shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  order: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  transaction: vi.fn(),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    order: mocks.order,
    $transaction: mocks.transaction,
  },
}));

const baseOrder = {
  id: "order-1",
  orderNumber: "ORD-1",
  userId: "user-1",
  status: "PENDING",
  version: 2,
  paymentMethod: "COD",
  paymentStatus: "PENDING",
  subtotal: 100,
  tax: 5,
  shippingFee: 10,
  total: 115,
  discountAmount: 0,
  discountCode: null,
  customerName: "Test User",
  customerEmail: "test@example.com",
  customerPhone: "0123456789",
  customerAddress: "Test address",
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  items: [{
    id: "item-1",
    orderId: "order-1",
    productId: "product-1",
    quantity: 2,
    price: 50,
    total: 100,
    product: { id: "product-1", name: "Shirt", images: ["shirt.jpg"], slug: "shirt" },
  }],
};

describe("PrismaOrdersRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.findMany.mockResolvedValue([]);
    mocks.order.count.mockResolvedValue(0);
    mocks.order.findFirst.mockResolvedValue(null);
    mocks.order.findUnique.mockResolvedValue(null);
    mocks.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it("maps user orders and converts persisted money values", async () => {
    mocks.order.findMany.mockResolvedValue([baseOrder]);
    const repository = new PrismaOrdersRepository();

    const result = await repository.findByUser("user-1", 0, 10);

    expect(result[0]).toMatchObject({
      id: "order-1",
      subtotal: 100,
      tax: 5,
      shippingFee: 10,
      total: 115,
      items: [{
        id: "item-1",
        price: 50,
        total: 100,
        product: { id: "product-1", name: "Shirt" },
      }],
    });
    expect(mocks.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      skip: 0,
      take: 10,
    }));
  });

  it("counts orders for a user", async () => {
    mocks.order.count.mockResolvedValue(7);
    await expect(new PrismaOrdersRepository().countByUser("user-1")).resolves.toBe(7);
    expect(mocks.order.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("returns null when an order is not owned by the requested user", async () => {
    mocks.order.findFirst.mockResolvedValue(null);
    await expect(new PrismaOrdersRepository().findByIdAndUser("order-1", "user-2")).resolves.toBeNull();
    expect(mocks.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", userId: "user-2" },
    }));
  });

  it("maps an order found by id and user", async () => {
    mocks.order.findFirst.mockResolvedValue(baseOrder);
    const result = await new PrismaOrdersRepository().findByIdAndUser("order-1", "user-1");
    expect(result?.orderNumber).toBe("ORD-1");
  });

  it("applies only supplied admin filters and includes the user view", async () => {
    const adminOrder = { ...baseOrder, user: {
      id: "user-1", email: "test@example.com", firstName: "Test", lastName: "User",
    } };
    mocks.order.findMany.mockResolvedValue([adminOrder]);

    const result = await new PrismaOrdersRepository().findManyAdmin(
      { status: "PENDING" as never, userId: "user-1" },
      10,
      5,
    );

    expect(mocks.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PENDING", userId: "user-1" },
      skip: 10,
      take: 5,
    }));
    expect(result[0].user).toEqual(adminOrder.user);
  });

  it("counts admin orders with an empty filter", async () => {
    mocks.order.count.mockResolvedValue(3);
    await expect(new PrismaOrdersRepository().countAdmin({})).resolves.toBe(3);
    expect(mocks.order.count).toHaveBeenCalledWith({ where: {} });
  });

  it("returns null when an order id does not exist", async () => {
    await expect(new PrismaOrdersRepository().findById("missing")).resolves.toBeNull();
  });

  it("updates status, persists events and returns the updated order", async () => {
    const updated = { ...baseOrder, status: "PROCESSING", version: 3 };
    const tx = {
      order: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    };
    mocks.transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback(tx));
    const persistEvents = vi.fn().mockResolvedValue(undefined);
    const aggregate = { status: "PROCESSING" } as never;

    const result = await new PrismaOrdersRepository(persistEvents).updateStatusWithEvents(
      "order-1",
      2,
      aggregate,
    );

    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", version: 2 },
      data: { status: "PROCESSING", version: { increment: 1 } },
    }));
    expect(persistEvents).toHaveBeenCalledWith(tx, [aggregate], new Map([["order-1", 3]]));
    expect(result.status).toBe("PROCESSING");
  });

  it("rejects an optimistic concurrency conflict without persisting events", async () => {
    const tx = { order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn() } };
    mocks.transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback(tx));
    const persistEvents = vi.fn();

    await expect(new PrismaOrdersRepository(persistEvents).updateStatusWithEvents(
      "order-1", 2, { status: "PROCESSING" } as never,
    )).rejects.toBeInstanceOf(ConflictError);

    expect(persistEvents).not.toHaveBeenCalled();
    expect(tx.order.findUnique).not.toHaveBeenCalled();
  });

  it("rejects when the order disappears after the status update", async () => {
    const tx = {
      order: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    mocks.transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback(tx));

    await expect(new PrismaOrdersRepository(vi.fn()).updateStatusWithEvents(
      "order-1", 2, { status: "PROCESSING" } as never,
    )).rejects.toThrow("Order disappeared during status update.");
  });
});
