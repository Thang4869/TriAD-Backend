import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaProjectionStore } from "@core/outbox/prisma-projection.store";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { ProductPriceChangedEvent } from "@shared/domain/events/product-events";

vi.mock("@core/database/prisma", () => ({
  default: {
    orderHistoryProjection: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    productCatalogProjection: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
    adminDashboardProjection: {
      upsert: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  orderHistoryProjection: {
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  productCatalogProjection: {
    upsert: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  adminDashboardProjection: {
    upsert: ReturnType<typeof vi.fn>;
  };
  user: {
    count: ReturnType<typeof vi.fn>;
  };
  product: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe("PrismaProjectionStore", () => {
  const store = new PrismaProjectionStore();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts an order history projection", async () => {
    mockedPrisma.orderHistoryProjection.upsert.mockResolvedValue(undefined);

    const event = new OrderPlacedEvent(
      "order-1",
      "user-1",
      "ORD-1",
      "User",
      "u@example.com",
      100,
      [],
    );

    await store.upsertOrderPlaced(event);

    expect(mockedPrisma.orderHistoryProjection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order-1" },
        create: expect.objectContaining({
          orderId: "order-1",
          userId: "user-1",
          orderNumber: "ORD-1",
          total: 100,
        }),
        update: expect.objectContaining({
          userId: "user-1",
          orderNumber: "ORD-1",
          total: 100,
        }),
      }),
    );
  });

  it("upserts the current product into the catalog projection", async () => {
    mockedPrisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      name: "Item",
      description: "Description",
      price: 100,
      stock: 5,
      category: "test",
      images: [],
      slug: "item",
      isActive: true,
      version: 1,
    });
    mockedPrisma.productCatalogProjection.upsert.mockResolvedValue(undefined);

    const event = new ProductPriceChangedEvent("product-1", 90, 100);

    await store.upsertProduct(event);

    expect(mockedPrisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: "product-1" },
    });

    expect(mockedPrisma.productCatalogProjection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: "product-1" },
        create: expect.objectContaining({
          productId: "product-1",
          sourceVersion: 1,
        }),
        update: expect.objectContaining({
          sourceVersion: 1,
        }),
      }),
    );
  });

  it("does not create a product projection when the product no longer exists", async () => {
    mockedPrisma.product.findUnique.mockResolvedValue(null);

    const event = new ProductPriceChangedEvent("product-1", 90, 100);

    await store.upsertProduct(event);

    expect(mockedPrisma.productCatalogProjection.upsert).not.toHaveBeenCalled();
  });

  it("refreshes the admin dashboard projection", async () => {
    mockedPrisma.orderHistoryProjection.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6);

    mockedPrisma.orderHistoryProjection.aggregate.mockResolvedValue({
      _sum: { total: 1000 },
    });
    mockedPrisma.user.count.mockResolvedValue(20);
    mockedPrisma.productCatalogProjection.count.mockResolvedValue(30);
    mockedPrisma.adminDashboardProjection.upsert.mockResolvedValue(undefined);

    await store.refreshDashboard();

    expect(mockedPrisma.adminDashboardProjection.upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        totalOrders: 10,
        totalRevenue: 1000,
        pendingOrders: 3,
        completedOrders: 6,
        totalUsers: 20,
        totalProducts: 30,
      },
      update: {
        totalOrders: 10,
        totalRevenue: 1000,
        pendingOrders: 3,
        completedOrders: 6,
        totalUsers: 20,
        totalProducts: 30,
      },
    });
  });
});
