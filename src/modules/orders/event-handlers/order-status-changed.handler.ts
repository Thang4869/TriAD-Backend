import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";
import { NotificationsService } from "@modules/notifications/notifications.service";
import { NotificationType } from "@shared/constants/notification-type.enum";
import { logger } from "@core/logger/winston";

export class OrderStatusChangedHandler {
  constructor(private readonly notificationsService: NotificationsService) {}

  async handle(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await this.notificationsService.createNotification(
        event.metadata?.userId as string,
        `Order ${event.aggregateId} status changed to ${event.newStatus}`,
        `Your order status has been updated to ${event.newStatus}.`,
        NotificationType.ORDER_UPDATE,
      );
      logger.info(
        `Notification sent for order ${event.aggregateId} status change.`,
      );
    } catch (error) {
      logger.error("Error handling OrderStatusChangedEvent", { error });
    }
  }
}
