import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@core/queue/bull", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

import { emailQueue } from "@core/queue/bull";
import { BullMqEmailQueue } from "@shared/infrastructure/queue/bullmq-email-queue";

describe("BullMqEmailQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps idempotencyKey to BullMQ jobId", async () => {
    const queue = new BullMqEmailQueue();
    const payload = { to: "customer@example.com" };

    await queue.enqueue("order-confirmation", payload, {
      idempotencyKey: "order-confirmation-order-1",
    });

    expect(emailQueue.add).toHaveBeenCalledWith("order-confirmation", payload, {
      jobId: "order-confirmation-order-1",
    });
  });

  it("does not set BullMQ options when idempotencyKey is absent", async () => {
    const queue = new BullMqEmailQueue();
    const payload = { to: "customer@example.com" };

    await queue.enqueue("verify-email", payload);

    expect(emailQueue.add).toHaveBeenCalledWith(
      "verify-email",
      payload,
      undefined,
    );
  });
});
