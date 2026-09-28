import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";
import { NotificationsService } from "@modules/notifications/notifications.service";
import { NotificationType } from "@shared/constants/notification-type.enum";
import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";

describe("OrderStatusChangedHandler", () => {
  let notificationsService: Pick<NotificationsService, "createNotification">;
  let handler: OrderStatusChangedHandler;

  beforeEach(() => {
    notificationsService = {
      createNotification: vi.fn().mockResolvedValue(undefined),
    };

    handler = new OrderStatusChangedHandler(
      notificationsService as NotificationsService,
    );
  });

  it("creates an order status notification", async () => {
    const event = createEvent();

    await handler.handle(event);

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      "user-1",
      "Order order-1 status changed to SHIPPED",
      "Your order status has been updated to SHIPPED.",
      NotificationType.ORDER_UPDATE,
      "order-status-order-1-SHIPPED",
    );
  });

  it("rethrows when creating the notification fails", async () => {
    const error = new Error("notification unavailable");

    vi.mocked(notificationsService.createNotification).mockRejectedValue(error);

    await expect(handler.handle(createEvent())).rejects.toBe(error);
  });
});

function createEvent(): OrderStatusChangedEvent {
  return new OrderStatusChangedEvent(
    "order-1",
    "PROCESSING",
    "SHIPPED",
    "user-1",
  );
}
