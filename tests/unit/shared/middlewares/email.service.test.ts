import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailService } from "@shared/services/email.service";

vi.mock("@core/queue/bull", () => ({ emailQueue: { add: vi.fn() } }));
vi.mock("@core/logger/winston", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
import { emailQueue } from "@core/queue/bull";
import { logger } from "@core/logger/winston";

describe("EmailService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("sendOrderConfirmation", () => {
    it("enqueue job đúng template và map items sang name/quantity/price", async () => {
      vi.mocked(emailQueue.add).mockResolvedValueOnce(undefined as never);
      const service = new EmailService();
      const items = [{ product: { name: "Item A" }, quantity: 2, price: 50 }];

      await service.sendOrderConfirmation(
        { email: "a@test.com" },
        { orderNumber: "ORD-1", total: 100 },
        items,
      );

      expect(emailQueue.add).toHaveBeenCalledWith(
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
      vi.mocked(emailQueue.add).mockRejectedValueOnce(new Error("queue down"));
      const service = new EmailService();

      await expect(
        service.sendOrderConfirmation(
          { email: "a@test.com" },
          { orderNumber: "ORD-1", total: 100 },
          [],
        ),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("sendVerificationEmail", () => {
    it("enqueue job verify-email với đúng data", async () => {
      vi.mocked(emailQueue.add).mockResolvedValueOnce(undefined as never);
      const service = new EmailService();

      await service.sendVerificationEmail(
        { email: "a@test.com", firstName: "A" },
        "https://app.com/verify?token=abc",
      );

      expect(emailQueue.add).toHaveBeenCalledWith(
        "verify-email",
        expect.objectContaining({
          to: "a@test.com",
          data: { name: "A", verifyUrl: "https://app.com/verify?token=abc" },
        }),
      );
    });

    it("nuốt lỗi và log error thay vì throw khi enqueue thất bại", async () => {
      vi.mocked(emailQueue.add).mockRejectedValueOnce(new Error("queue down"));
      const service = new EmailService();

      await expect(
        service.sendVerificationEmail(
          { email: "a@test.com", firstName: "A" },
          "url",
        ),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
