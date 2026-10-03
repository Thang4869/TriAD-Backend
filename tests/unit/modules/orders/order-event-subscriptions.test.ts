import { describe, expect, it, vi } from "vitest";

import { EventBus } from "@shared/domain/event-bus/event-bus";
import {
  OrderCancelledEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import { registerOrderEventSubscriptions } from "@modules/orders/order-event-subscriptions";

describe("registerOrderEventSubscriptions", () => {
  it("routes cancellation generic side effects only through OrderStatusChanged", async () => {
    const eventBus = new EventBus();

    const handleStatusNotification = vi.fn().mockResolvedValue(undefined);
    const handleStatusProjection = vi.fn().mockResolvedValue(undefined);

    registerOrderEventSubscriptions(eventBus, {
      handleStatusNotification,
      handleStatusProjection,
    });

    const statusChanged = new OrderStatusChangedEvent(
      "order-1",
      "PENDING",
      "CANCELLED",
      "user-1",
    );

    await eventBus.publish(statusChanged);

    expect(handleStatusNotification).toHaveBeenCalledTimes(1);
    expect(handleStatusProjection).toHaveBeenCalledTimes(1);

    expect(handleStatusNotification).toHaveBeenCalledWith(statusChanged);
    expect(handleStatusProjection).toHaveBeenCalledWith(statusChanged);

    const cancelled = new OrderCancelledEvent("order-1", "user-1");

    await eventBus.publish(cancelled);

    // OrderCancelled is cancellation-specific and must not repeat the
    // generic notification or order-history projection.
    expect(handleStatusNotification).toHaveBeenCalledTimes(1);
    expect(handleStatusProjection).toHaveBeenCalledTimes(1);
  });

  it("still routes normal status changes through both generic handlers", async () => {
    const eventBus = new EventBus();

    const handleStatusNotification = vi.fn().mockResolvedValue(undefined);
    const handleStatusProjection = vi.fn().mockResolvedValue(undefined);

    registerOrderEventSubscriptions(eventBus, {
      handleStatusNotification,
      handleStatusProjection,
    });

    await eventBus.publish(
      new OrderStatusChangedEvent("order-1", "PROCESSING", "SHIPPED", "user-1"),
    );

    expect(handleStatusNotification).toHaveBeenCalledTimes(1);
    expect(handleStatusProjection).toHaveBeenCalledTimes(1);
  });
});
