import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { ProductPriceChangedEvent } from "@shared/domain/events/product-events";
import { ProjectionHandler } from "@core/outbox/projection-handler";
import type { ProjectionStore } from "@core/outbox/projection-store.port";
import { ReviewCreatedEvent } from "@shared/domain/events/review-events";
describe("ProjectionHandler", () => {
  let store: ProjectionStore;

  beforeEach(() => {
    store = {
      upsertOrderPlaced: vi.fn().mockResolvedValue(undefined),
      updateOrderStatus: vi.fn().mockResolvedValue(undefined),
      upsertProduct: vi.fn().mockResolvedValue(undefined),
      refreshDashboard: vi.fn().mockResolvedValue(undefined),
      refreshProductRating: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("upserts order history and refreshes the dashboard", async () => {
    const handler = new ProjectionHandler(store);

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

    await handler.handleOrderPlaced(event);

    expect(store.upsertOrderPlaced).toHaveBeenCalledOnce();
    expect(store.upsertOrderPlaced).toHaveBeenCalledWith(event);
    expect(store.refreshDashboard).toHaveBeenCalledOnce();
  });

  it("is safe to process concurrent duplicate product events", async () => {
    const handler = new ProjectionHandler(store);
    const event = new ProductPriceChangedEvent("product-1", 90, 100);

    await Promise.all([
      handler.handleProductEvent(event),
      handler.handleProductEvent(event),
    ]);

    expect(store.upsertProduct).toHaveBeenCalledTimes(2);
    expect(store.upsertProduct).toHaveBeenNthCalledWith(1, event);
    expect(store.upsertProduct).toHaveBeenNthCalledWith(2, event);
  });

  it("refreshes product rating when a review changes", async () => {
    const handler = new ProjectionHandler(store);
    const event = new ReviewCreatedEvent("product-1");

    await handler.handleProductRatingChanged(event);

    expect(store.refreshProductRating).toHaveBeenCalledOnce();
    expect(store.refreshProductRating).toHaveBeenCalledWith("product-1");
  });
});
