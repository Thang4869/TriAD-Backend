import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { EmailService } from "@shared/services/email.service";
import { logger } from "@core/logger/winston";

export class OrderPlacedHandler {
  constructor(private readonly emailService: EmailService) {}

  async handle(event: OrderPlacedEvent): Promise<void> {
    try {
      await this.emailService.sendOrderConfirmation(
        { email: "user@example.com" },
        { orderNumber: event.aggregateId, total: event.total },
        event.items.map((item) => ({
          product: { name: "Product" },
          quantity: item.quantity,
          price: item.price,
        })),
      );
      logger.info(`Order ${event.aggregateId} placed, notifications sent.`);
    } catch (error) {
      logger.error("Error handling OrderPlacedEvent", { error });
    }
  }
}
