import { describe, expect, it, vi } from "vitest";
import {
  CancellationRefundSaga,
  CancellationRefundState,
  CancellationRefundPorts,
} from "@modules/orders/application/cancellation-refund.saga";
import { InMemorySagaStateStore } from "@shared/application/saga/saga-state";
import { noopMetrics, noopTracer } from "../../../helpers/observability";

describe("CancellationRefundSaga", () => {
  it("cancels, releases stock and refunds in order", async () => {
    const store = new InMemorySagaStateStore<CancellationRefundState>();
    const calls: string[] = [];
    const ports: CancellationRefundPorts = {
      cancelOrder: vi.fn(async () => void calls.push("cancel")),
      releaseStock: vi.fn(async () => void calls.push("release")),
      refund: vi.fn(async () => void calls.push("refund")),
    };

    const state = await new CancellationRefundSaga(
      ports,
      store,
      noopTracer,
      noopMetrics,
    ).execute({
      sagaId: "saga-1",
      orderId: "order-1",
      paymentId: "payment-1",
    });

    expect(state.step).toBe("COMPLETED");
    expect(calls).toEqual(["cancel", "release", "refund"]);
  });

  it("resumes a completed refund without repeating side effects", async () => {
    const store = new InMemorySagaStateStore<CancellationRefundState>();
    await store.save("saga-2", {
      sagaId: "saga-2",
      orderId: "order-2",
      paymentId: "payment-2",
      step: "REFUNDED",
    });
    const ports: CancellationRefundPorts = {
      cancelOrder: vi.fn(),
      releaseStock: vi.fn(),
      refund: vi.fn(),
    };

    const state = await new CancellationRefundSaga(
      ports,
      store,
      noopTracer,
      noopMetrics,
    ).execute({ sagaId: "saga-2", orderId: "order-2" });

    expect(state.step).toBe("COMPLETED");
    expect(ports.cancelOrder).not.toHaveBeenCalled();
    expect(ports.releaseStock).not.toHaveBeenCalled();
    expect(ports.refund).not.toHaveBeenCalled();
  });

  it("completes after stock release when no payment needs a refund", async () => {
    const store = new InMemorySagaStateStore<CancellationRefundState>();
    await store.save("saga-3", {
      sagaId: "saga-3",
      orderId: "order-3",
      step: "STOCK_RELEASED",
      deadlineAt: Date.now() + 60_000,
    });
    const ports: CancellationRefundPorts = {
      cancelOrder: vi.fn(),
      releaseStock: vi.fn(),
      refund: vi.fn(),
    };

    const state = await new CancellationRefundSaga(
      ports,
      store,
      noopTracer,
      noopMetrics,
    ).execute({ sagaId: "saga-3", orderId: "order-3" });

    expect(state.step).toBe("COMPLETED");
    expect(ports.refund).not.toHaveBeenCalled();
  });
});
