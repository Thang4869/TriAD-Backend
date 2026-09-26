import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailQueuePort } from "@shared/application/ports/email-queue.port";
vi.mock("@core/circuit-breaker/circuit-breaker", () => ({
  withCircuitBreaker: vi.fn((fn) => fn),
  withRetry: vi.fn((fn) => fn()),
}));

import { EmailService } from "@shared/services/email.service";

vi.mock("@core/logger/winston", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
import { logger } from "@core/logger/winston";
function createEmailQueue(): EmailQueuePort {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
  };
}
describe("EmailService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("sendOrderConfirmation", () => {
    it("enqueue job đúng template và map items sang name/quantity/price", async () => {
      const emailQueue = createEmailQueue();
      const service = new EmailService(emailQueue);

      const items = [{ productName: "Item A", quantity: 2, price: 50 }];

      await service.sendOrderConfirmation(
        { email: "a@test.com" },
        { orderNumber: "ORD-1", total: 100 },
        items,
      );

      expect(emailQueue.enqueue).toHaveBeenCalledWith(
        "order-confirmation",
        expect.objectContaining({
          to: "a@test.com",
          template: "order-confirmation",
          data: expect.objectContaining({
            items: [{ name: "Item A", quantity: 2, price: 50 }],
          }),
        }),
      );
    });

    it("nuốt lỗi và log error thay vì throw khi enqueue thất bại (không làm fail luồng checkout)", async () => {
      const emailQueue = createEmailQueue();

      vi.mocked(emailQueue.enqueue).mockRejectedValueOnce(
        new Error("queue down"),
      );

      const service = new EmailService(emailQueue);

      await expect(
        service.sendOrderConfirmation(
          { email: "a@test.com" },
          { orderNumber: "ORD-1", total: 100 },
          [],
        ),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
    }, 10000);
  });

  describe("sendVerificationEmail", () => {
    it("enqueue job verify-email với đúng data", async () => {
      const emailQueue = createEmailQueue();
      const service = new EmailService(emailQueue);

      await service.sendVerificationEmail(
        { email: "a@test.com", firstName: "A" },
        "https://app.com/verify?token=abc",
      );

      expect(emailQueue.enqueue).toHaveBeenCalledWith(
        "verify-email",
        expect.objectContaining({
          to: "a@test.com",
          data: {
            name: "A",
            verifyUrl: "https://app.com/verify?token=abc",
          },
        }),
      );
    });

    it("nuốt lỗi và log error thay vì throw khi enqueue thất bại", async () => {
      const emailQueue = createEmailQueue();

      vi.mocked(emailQueue.enqueue).mockRejectedValueOnce(
        new Error("queue down"),
      );

      const service = new EmailService(emailQueue);

      await expect(
        service.sendVerificationEmail(
          { email: "a@test.com", firstName: "A" },
          "url",
        ),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
    }, 10000);
  });
});
