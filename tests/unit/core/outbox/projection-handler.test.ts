import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { ProductPriceChangedEvent } from "@shared/domain/events/product-events";
import { ProjectionHandler } from "@core/outbox/projection-handler";
import type { ProjectionStore } from "@core/outbox/projection-store.port";
import { ReviewCreatedEvent } from "@shared/domain/events/review-events";
import { UserRegisteredEvent } from "@shared/domain/events/user-events";
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
    expect(store.refreshDashboard).toHaveBeenCalledTimes(2);
  });

  it("refreshes product rating when a review changes", async () => {
    const handler = new ProjectionHandler(store);
    const event = new ReviewCreatedEvent("product-1");

    await handler.handleProductRatingChanged(event);

    expect(store.refreshProductRating).toHaveBeenCalledOnce();
    expect(store.refreshProductRating).toHaveBeenCalledWith("product-1");
  });

  it("refreshes the dashboard when a user registers", async () => {
    const handler = new ProjectionHandler(store);
    const event = new UserRegisteredEvent("user-1", "u@example.com");

    await handler.handleUserRegistered(event);

    expect(store.refreshDashboard).toHaveBeenCalledOnce();
  });
  it("records event age only after successful order projection", async () => {
    const { projectionEventAgeSeconds } = await import("@core/metrics/metrics.registry");
    projectionEventAgeSeconds.reset();
    const event = new OrderPlacedEvent("lag-order", "lag-user", "LAG-ORDER",
      "User", "u@example.com", "PENDING", 100, 0, 0, 100, []);
    const fakeClock = vi.spyOn(Date, "now").mockReturnValue(event.occurredAt.getTime() + 2500);
    try {
      await new ProjectionHandler(store).handleOrderPlaced(event);
    } finally {
      fakeClock.mockRestore();
    }
    const samples = await projectionEventAgeSeconds.get();
    expect(samples.values).toContainEqual(expect.objectContaining({
      metricName: "triad_backend_projection_event_age_seconds_count",
      labels: { projection: "order_history" },
      value: 1,
    }));
    expect(samples.values).toContainEqual(expect.objectContaining({
      metricName: "triad_backend_projection_event_age_seconds_sum",
      labels: { projection: "order_history" },
      value: 2.5,
    }));
    projectionEventAgeSeconds.reset();
  });

  it("does not count failed projection writes as successful age samples", async () => {
    const { projectionEventAgeSeconds } = await import("@core/metrics/metrics.registry");
    projectionEventAgeSeconds.reset();
    vi.mocked(store.upsertOrderPlaced).mockRejectedValueOnce(new Error("DB unavailable"));
    const event = new OrderPlacedEvent("failed-order", "user", "FAILED-ORDER",
      "User", "u@example.com", "PENDING", 100, 0, 0, 100, []);
    await expect(new ProjectionHandler(store).handleOrderPlaced(event))
      .rejects.toThrow("DB unavailable");
    const samples = await projectionEventAgeSeconds.get();
    expect(samples.values).not.toContainEqual(expect.objectContaining({
      metricName: "triad_backend_projection_event_age_seconds_count",
      labels: { projection: "order_history" },
    }));
    projectionEventAgeSeconds.reset();
  });

});
