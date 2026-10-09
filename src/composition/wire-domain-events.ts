import type { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import type { EventBus } from "@shared/domain/event-bus/event-bus";

import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductPriceChangedEvent,
  ProductRestockedEvent,
  ProductStockDepletedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
} from "@shared/domain/events/product-events";
import {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
} from "@shared/domain/events/review-events";
import { UserRegisteredEvent } from "@shared/domain/events/user-events";

import { registerOrderEventSubscriptions } from "@modules/orders/order-event-subscriptions";

const wiredEventBuses = new WeakSet<EventBus>();

const productProjectionEvents = [
  ProductCreatedEvent.eventName,
  ProductUpdatedEvent.eventName,
  ProductPriceChangedEvent.eventName,
  ProductRestockedEvent.eventName,
  ProductStockDepletedEvent.eventName,
  ProductActivatedEvent.eventName,
  ProductDeactivatedEvent.eventName,
] as const;

const reviewProjectionEvents = [
  ReviewCreatedEvent.eventName,
  ReviewDeletedEvent.eventName,
] as const;

export function wireDomainEvents(container: Container): void {
  const eventBus = container.resolve(TOKENS.EventBus);

  if (wiredEventBuses.has(eventBus)) {
    return;
  }

  const orderPlacedHandler = container.resolve(TOKENS.OrderPlacedHandler);

  const orderStatusChangedHandler = container.resolve(
    TOKENS.OrderStatusChangedHandler,
  );

  const projectionHandler = container.resolve(TOKENS.ProjectionHandler);

  // Order placed: external side effects.
  eventBus.subscribe(
    OrderPlacedEvent.eventName,
    "OrderPlacedHandler",
    orderPlacedHandler.handle.bind(orderPlacedHandler),
  );

  // Order placed: read-model projections.
  eventBus.subscribe(
    OrderPlacedEvent.eventName,
    "OrderHistoryProjectionHandler",
    projectionHandler.handleOrderPlaced.bind(projectionHandler),
  );

  // Order lifecycle.
  // OrderCancelled intentionally has no generic lifecycle subscriber.
  registerOrderEventSubscriptions(eventBus, {
    handleStatusNotification: orderStatusChangedHandler.handle.bind(
      orderStatusChangedHandler,
    ),

    handleStatusProjection:
      projectionHandler.handleOrderStatusChanged.bind(projectionHandler),
  });

  // Product catalog projections.
  for (const eventName of productProjectionEvents) {
    eventBus.subscribe(
      eventName,
      `ProductCatalogProjectionHandler:${eventName}`,
      projectionHandler.handleProductEvent.bind(projectionHandler),
    );
  }

  // Dashboard projection.
  eventBus.subscribe(
    UserRegisteredEvent.eventName,
    "DashboardProjectionHandler:UserRegistered",
    projectionHandler.handleUserRegistered.bind(projectionHandler),
  );

  // Product rating projections.
  for (const eventName of reviewProjectionEvents) {
    eventBus.subscribe(
      eventName,
      `ProductCatalogRatingProjectionHandler:${eventName}`,
      projectionHandler.handleProductRatingChanged.bind(projectionHandler),
    );
  }

  wiredEventBuses.add(eventBus);
}
