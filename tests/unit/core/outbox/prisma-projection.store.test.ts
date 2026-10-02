import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaProjectionStore } from "@core/outbox/prisma-projection.store";
import {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import { ProductPriceChangedEvent } from "@shared/domain/events/product-events";

vi.mock("@core/database/prisma", () => ({
  default: {
    orderHistoryProjection: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    productCatalogProjection: {
      create: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    review: {
      aggregate: vi.fn(),
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
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  orderHistoryProjection: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  productCatalogProjection: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  review: {
    aggregate: ReturnType<typeof vi.fn>;
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
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
};

describe("PrismaProjectionStore", () => {
  const store = new PrismaProjectionStore();
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.orderHistoryProjection.updateMany.mockResolvedValue({
      count: 0,
    });
    mockedPrisma.orderHistoryProjection.create.mockResolvedValue(undefined);
    mockedPrisma.productCatalogProjection.updateMany.mockResolvedValue({
      count: 0,
    });
    mockedPrisma.productCatalogProjection.create.mockResolvedValue(undefined);
    mockedPrisma.orderHistoryProjection.findUnique.mockResolvedValue({
      orderId: "order-1",
    });
    mockedPrisma.$transaction.mockImplementation((callback) =>
      callback(mockedPrisma),
    );
    mockedPrisma.$queryRaw.mockResolvedValue([]);
  });

  it("upserts an order history projection", async () => {
    const event = new OrderPlacedEvent(
      "order-1",
      "user-1",
      "ORD-1",
      "User",
      "u@example.com",
      "PENDING",
      100,
      10,
      30,
      140,
      [],
    );
    Object.assign(event, { sourceVersion: 0 });
    const occurredAt = event.occurredAt;
    await store.upsertOrderPlaced(event);

    expect(prisma.orderHistoryProjection.create).toHaveBeenCalledWith({
      data: {
        orderId: "order-1",
        userId: "user-1",
        orderNumber: "ORD-1",
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal: 100,
        tax: 10,
        shippingFee: 30,
        total: 140,
        items: [],
        placedAt: occurredAt,
        sourceVersion: 0,
      },
    });
  });

  it("rejects an unversioned order placement", async () => {
    const event = new OrderPlacedEvent(
      "order-legacy",
      "user-1",
      "ORD-LEGACY",
      "User",
      "u@example.com",
      "PENDING",
      100,
      0,
      0,
      100,
      [],
    );

    await expect(store.upsertOrderPlaced(event)).rejects.toThrow(
      "Versioned projection event is required",
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
    const event = new ProductPriceChangedEvent("product-1", 90, 100);

    await store.upsertProduct(event);

    expect(mockedPrisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: "product-1" },
    });

    expect(mockedPrisma.productCatalogProjection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "product-1",
          sourceVersion: 1,
        }),
      }),
    );
  });

  it("applies only a newer order status revision", async () => {
    const event = new OrderStatusChangedEvent(
      "order-1",
      "PROCESSING",
      "SHIPPED",
      "user-1",
    );
    Object.assign(event, { sourceVersion: 2 });
    mockedPrisma.orderHistoryProjection.updateMany.mockResolvedValue({
      count: 1,
    });

    await store.updateOrderStatus(event);

    expect(mockedPrisma.orderHistoryProjection.updateMany).toHaveBeenCalledWith(
      {
        where: { orderId: "order-1", sourceVersion: { lt: 2 } },
        data: { status: "SHIPPED", sourceVersion: 2 },
      },
    );
    expect(
      mockedPrisma.orderHistoryProjection.findUnique,
    ).not.toHaveBeenCalled();
  });

  it("treats duplicate and stale order status revisions as no-ops", async () => {
    const event = new OrderStatusChangedEvent(
      "order-1",
      "PROCESSING",
      "SHIPPED",
      "user-1",
    );
    Object.assign(event, { sourceVersion: 2 });

    await store.updateOrderStatus(event);

    expect(mockedPrisma.orderHistoryProjection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order-1", sourceVersion: { lt: 2 } },
      }),
    );
    expect(
      mockedPrisma.orderHistoryProjection.findUnique,
    ).toHaveBeenCalledOnce();
  });

  it("throws a retryable dependency error when status precedes placement", async () => {
    mockedPrisma.orderHistoryProjection.findUnique.mockResolvedValue(null);
    const event = new OrderStatusChangedEvent(
      "order-1",
      "PENDING",
      "PROCESSING",
      "user-1",
    );
    Object.assign(event, { sourceVersion: 1 });

    await expect(store.updateOrderStatus(event)).rejects.toMatchObject({
      name: "ProjectionDependencyError",
      retryable: true,
    });
  });

  it("rejects an unversioned order status", async () => {
    const event = new OrderStatusChangedEvent(
      "order-legacy",
      "PENDING",
      "PROCESSING",
      "user-1",
    );

    await expect(store.updateOrderStatus(event)).rejects.toThrow(
      "Versioned projection event is required",
    );
  });

  it("does not create a product projection when the product no longer exists", async () => {
    mockedPrisma.product.findUnique.mockResolvedValue(null);

    const event = new ProductPriceChangedEvent("product-1", 90, 100);

    await store.upsertProduct(event);

    expect(mockedPrisma.productCatalogProjection.create).not.toHaveBeenCalled();
  });

  it("refreshes product catalog rating aggregates", async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { rating: 2 },
    });
    mockedPrisma.productCatalogProjection.updateMany.mockResolvedValue({
      count: 1,
    });

    await store.refreshProductRating("product-1");

    expect(mockedPrisma.review.aggregate).toHaveBeenCalledWith({
      where: { productId: "product-1" },
      _avg: { rating: true },
      _count: { rating: true },
    });

    expect(
      mockedPrisma.productCatalogProjection.updateMany,
    ).toHaveBeenCalledWith({
      where: { productId: "product-1" },
      data: {
        avgRating: 4.5,
        reviewCount: 2,
      },
    });
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

    expect(mockedPrisma.orderHistoryProjection.aggregate).toHaveBeenCalledWith({
      where: { status: { not: "CANCELLED" } },
      _sum: { total: true },
    });

    expect(mockedPrisma.adminDashboardProjection.upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        totalOrders: 10,
        totalGrossOrderValue: 1000,
        pendingOrders: 3,
        completedOrders: 6,
        totalUsers: 20,
        totalProducts: 30,
      },
      update: {
        totalOrders: 10,
        totalGrossOrderValue: 1000,
        pendingOrders: 3,
        completedOrders: 6,
        totalUsers: 20,
        totalProducts: 30,
      },
    });
  });
});
