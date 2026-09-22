import { describe, expect, it, vi } from "vitest";
import {
  CancellationRefundSaga,
  CancellationRefundPorts,
} from "@modules/orders/application/cancellation-refund.saga";

describe("CancellationRefundSaga", () => {
  it("cancels, releases stock and refunds in order", async () => {
    const calls: string[] = [];
    const ports: CancellationRefundPorts = {
      cancelOrder: vi.fn(async () => void calls.push("cancel")),
      releaseStock: vi.fn(async () => void calls.push("release")),
      refund: vi.fn(async () => void calls.push("refund")),
    };

    const state = await new CancellationRefundSaga(ports).execute({
      sagaId: "saga-1",
      orderId: "order-1",
      paymentId: "payment-1",
    });

    expect(state.step).toBe("COMPLETED");
    expect(calls).toEqual(["cancel", "release", "refund"]);
  });
});
