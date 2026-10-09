import { describe, expect, it, vi } from "vitest";

import { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";
import { EventBus } from "@shared/domain/event-bus/event-bus";

import type { ProjectionHandler } from "@core/outbox/projection-handler";
import type { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import type { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";

import { wireDomainEvents } from "@/composition/wire-domain-events";

function createTestContainer(): {
  container: Container;
  eventBus: EventBus;
} {
  const container = new Container();
  const eventBus = new EventBus();

  const projectionHandler = {
    handleOrderPlaced: vi.fn(),
    handleOrderStatusChanged: vi.fn(),
    handleProductEvent: vi.fn(),
    handleUserRegistered: vi.fn(),
    handleProductRatingChanged: vi.fn(),
  } as unknown as ProjectionHandler;

  const orderPlacedHandler = {
    handle: vi.fn(),
  } as unknown as OrderPlacedHandler;

  const orderStatusChangedHandler = {
    handle: vi.fn(),
  } as unknown as OrderStatusChangedHandler;

  container.register(TOKENS.EventBus, () => eventBus);

  container.register(TOKENS.ProjectionHandler, () => projectionHandler);

  container.register(TOKENS.OrderPlacedHandler, () => orderPlacedHandler);

  container.register(
    TOKENS.OrderStatusChangedHandler,
    () => orderStatusChangedHandler,
  );

  return { container, eventBus };
}

describe("Domain event wiring", () => {
  it("registers the expected event subscriptions", () => {
    const { container, eventBus } = createTestContainer();
    const subscribe = vi.spyOn(eventBus, "subscribe");

    wireDomainEvents(container);

    const subscriptions = subscribe.mock.calls.map(
      ([eventName, handlerName]) => ({
        eventName,
        handlerName,
      }),
    );

    expect(subscriptions).toHaveLength(14);

    expect(subscriptions).toContainEqual({
      eventName: "OrderPlaced",
      handlerName: "OrderPlacedHandler",
    });

    expect(subscriptions).toContainEqual({
      eventName: "OrderPlaced",
      handlerName: "OrderHistoryProjectionHandler",
    });

    expect(subscriptions).toContainEqual({
      eventName: "OrderStatusChanged",
      handlerName: "OrderStatusChangedHandler",
    });

    expect(subscriptions).toContainEqual({
      eventName: "OrderStatusChanged",
      handlerName: "OrderHistoryStatusProjectionHandler",
    });

    expect(subscriptions).toContainEqual({
      eventName: "UserRegistered",
      handlerName: "DashboardProjectionHandler:UserRegistered",
    });

    expect(
      subscriptions.filter((entry) => entry.eventName === "OrderCancelled"),
    ).toHaveLength(0);

    expect(
      new Set(
        subscriptions.map((entry) => `${entry.eventName}:${entry.handlerName}`),
      ).size,
    ).toBe(14);
  });

  it("does not register subscriptions twice on the same EventBus", () => {
    const { container, eventBus } = createTestContainer();
    const subscribe = vi.spyOn(eventBus, "subscribe");

    wireDomainEvents(container);
    wireDomainEvents(container);

    expect(subscribe).toHaveBeenCalledTimes(14);
  });

  it("registers subscriptions for a different EventBus", () => {
    const first = createTestContainer();
    const second = createTestContainer();

    const firstSubscribe = vi.spyOn(first.eventBus, "subscribe");
    const secondSubscribe = vi.spyOn(second.eventBus, "subscribe");

    wireDomainEvents(first.container);
    wireDomainEvents(second.container);

    expect(firstSubscribe).toHaveBeenCalledTimes(14);
    expect(secondSubscribe).toHaveBeenCalledTimes(14);
  });
});
