import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { EmailService } from "@shared/services/email.service";

describe("OrderPlacedHandler", () => {
  let emailService: Pick<EmailService, "sendOrderConfirmation">;
  let handler: OrderPlacedHandler;

  beforeEach(() => {
    emailService = {
      sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    };

    handler = new OrderPlacedHandler(emailService as EmailService);
  });

  it("sends the order confirmation email", async () => {
    const event = createEvent();

    await handler.handle(event);

    expect(emailService.sendOrderConfirmation).toHaveBeenCalledWith(
      { email: "customer@example.com" },
      { orderNumber: "ORD-001", total: 100 },
      [
        {
          productName: "Product 1",
          quantity: 2,
          price: 50,
        },
      ],
      "order-confirmation-order-1",
    );
  });

  it("rethrows when sending the order confirmation fails", async () => {
    const error = new Error("email unavailable");

    vi.mocked(emailService.sendOrderConfirmation).mockRejectedValue(error);

    await expect(handler.handle(createEvent())).rejects.toBe(error);
  });
});

function createEvent(): OrderPlacedEvent {
  return new OrderPlacedEvent(
    "order-1",
    "user-1",
    "ORD-001",
    "Customer Name",
    "customer@example.com",
    100,
    [
      {
        productId: "product-1",
        productName: "Product 1",
        quantity: 2,
        unitPrice: 50,
      },
    ],
  );
}
