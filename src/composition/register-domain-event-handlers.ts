import type { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { ProjectionHandler } from "@core/outbox/projection-handler";
import { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";

export function registerDomainEventHandlers(container: Container): void {
  container.register(
    TOKENS.ProjectionHandler,
    (c) => new ProjectionHandler(c.resolve(TOKENS.ProjectionStore)),
  );

  container.register(
    TOKENS.OrderPlacedHandler,
    (c) => new OrderPlacedHandler(c.resolve(TOKENS.EmailService)),
  );

  container.register(
    TOKENS.OrderStatusChangedHandler,
    (c) =>
      new OrderStatusChangedHandler(c.resolve(TOKENS.NotificationsService)),
  );
}
