import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { ProductPriceChangedEvent } from "@shared/domain/events/product-events";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    orderHistoryProjection: {
      upsert: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: 100 } }),
    },
    productCatalogProjection: {
      upsert: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(1),
    },
    adminDashboardProjection: { upsert: vi.fn().mockResolvedValue(undefined) },
    user: { count: vi.fn().mockResolvedValue(1) },
    product: {
      findUnique: vi.fn().mockResolvedValue({
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
      }),
    },
  },
}));

vi.mock("@core/database/prisma", () => ({ default: prismaMock }));

import { ProjectionHandler } from "@core/outbox/projection-handler";

describe("ProjectionHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts order history and refreshes the dashboard", async () => {
    const handler = new ProjectionHandler();
    await handler.handleOrderPlaced(
      new OrderPlacedEvent(
        "order-1",
        "user-1",
        "ORD-1",
        "User",
        "u@example.com",
        100,
        [],
      ),
    );

    expect(prismaMock.orderHistoryProjection.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.adminDashboardProjection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "singleton" } }),
    );
  });

  it("is safe to process concurrent duplicate product events", async () => {
    const handler = new ProjectionHandler();
    const event = new ProductPriceChangedEvent("product-1", 90, 100);
    await Promise.all([
      handler.handleProductEvent(event),
      handler.handleProductEvent(event),
    ]);

    expect(prismaMock.productCatalogProjection.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.productCatalogProjection.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { productId: "product-1" } }),
    );
  });
});
