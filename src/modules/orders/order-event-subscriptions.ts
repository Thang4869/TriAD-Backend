import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";

export interface OrderEventSubscriptionHandlers {
  handleStatusNotification(event: OrderStatusChangedEvent): Promise<void>;
  handleStatusProjection(event: OrderStatusChangedEvent): Promise<void>;
}

export function registerOrderEventSubscriptions(
  eventBus: EventBus,
  handlers: OrderEventSubscriptionHandlers,
): void {
  eventBus.subscribe(
    OrderStatusChangedEvent.eventName,
    "OrderStatusChangedHandler",
    handlers.handleStatusNotification,
  );

  eventBus.subscribe(
    OrderStatusChangedEvent.eventName,
    "OrderHistoryStatusProjectionHandler",
    handlers.handleStatusProjection,
  );

  // OrderCancelled intentionally has no generic lifecycle subscriber.
  //
  // It is reserved for cancellation-specific workflows such as stock release
  // or payment refund. Generic notification/projection side effects belong to
  // OrderStatusChanged(CANCELLED).
}
