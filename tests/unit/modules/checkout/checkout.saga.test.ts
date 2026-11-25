import { describe, expect, it, vi } from "vitest";
import {
  CheckoutSaga,
  CheckoutSagaPorts,
  CheckoutSagaState,
} from "@modules/checkout/application/checkout.saga";
import { InMemorySagaStateStore } from "@shared/application/saga/saga-state";
import { SagaTimeoutError } from "@shared/application/saga/saga-state";
import { noopMetrics, noopTracer } from "../../../helpers/observability";

const input = {
  sagaId: "saga-1",
  userId: "user-1",
  total: 100,
  paymentMethod: "CARD",
  items: [{ productId: "product-1", quantity: 1 }],
};

function ports(): CheckoutSagaPorts {
  return {
    reserveStock: vi.fn().mockResolvedValue("reservation-1"),
    releaseStock: vi.fn().mockResolvedValue(undefined),
    placeOrder: vi.fn().mockResolvedValue("order-1"),
    cancelOrder: vi.fn().mockResolvedValue(undefined),
    authorizePayment: vi.fn().mockResolvedValue("payment-1"),
    refundPayment: vi.fn().mockResolvedValue(undefined),
    confirmOrder: vi.fn().mockResolvedValue(undefined),
  };
}

describe("CheckoutSaga", () => {
  it("completes all steps and persists state", async () => {
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    const actionPorts = ports();
    const state = await new CheckoutSaga(
      actionPorts,
      store,
      noopTracer,
      noopMetrics,
    ).execute(input);

    expect(state.step).toBe("COMPLETED");
    expect(actionPorts.confirmOrder).toHaveBeenCalledWith("order-1");
  });

  it("compensates completed forward steps when payment fails", async () => {
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    const actionPorts = ports();
    vi.mocked(actionPorts.authorizePayment).mockRejectedValue(
      new Error("payment down"),
    );

    await expect(
      new CheckoutSaga(actionPorts, store, noopTracer, noopMetrics).execute(
        input,
      ),
    ).rejects.toThrow("payment down");
    expect(actionPorts.cancelOrder).toHaveBeenCalledWith("order-1");
    expect(actionPorts.releaseStock).toHaveBeenCalledWith("reservation-1");
  });

  it("resumes from persisted state without repeating stock reservation", async () => {
    const actionPorts = ports();
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    await store.save("saga-1", {
      sagaId: "saga-1",
      orderId: "order-1",
      reservationId: "reservation-1",
      step: "ORDER_PLACED",
    });

    await new CheckoutSaga(actionPorts, store, noopTracer, noopMetrics).execute(
      input,
    );

    expect(actionPorts.reserveStock).not.toHaveBeenCalled();
    expect(actionPorts.placeOrder).not.toHaveBeenCalled();
  });

  it("times out a stuck step and preserves compensation state", async () => {
    const actionPorts = ports();
    vi.mocked(actionPorts.reserveStock).mockImplementation(
      () => new Promise<string>(() => undefined),
    );
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    await store.save("saga-timeout", {
      sagaId: "saga-timeout",
      step: "STARTED",
      deadlineAt: Date.now() + 5,
    });

    await expect(
      new CheckoutSaga(actionPorts, store, noopTracer, noopMetrics).execute({
        ...input,
        sagaId: "saga-timeout",
      }),
    ).rejects.toBeInstanceOf(SagaTimeoutError);
    expect((await store.load("saga-timeout"))?.step).toBe("COMPENSATED");
  });
});

describe("CheckoutSaga payment and compensation recovery", () => {
  it("skips payment authorization for cash-on-delivery checkouts", async () => {
    const actionPorts = ports();
    const state = await new CheckoutSaga(
      actionPorts,
      new InMemorySagaStateStore<CheckoutSagaState>(),
      noopTracer,
      noopMetrics,
    ).execute({ ...input, paymentMethod: "COD" });

    expect(state.step).toBe("COMPLETED");
    expect(actionPorts.authorizePayment).not.toHaveBeenCalled();
    expect(actionPorts.confirmOrder).toHaveBeenCalledWith("order-1");
  });

  it("resumes a saga with an already authorized payment without charging again", async () => {
    const actionPorts = ports();
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    await store.save(input.sagaId, {
      sagaId: input.sagaId,
      step: "PAYMENT_AUTHORIZED",
      reservationId: "reservation-1",
      orderId: "order-1",
      paymentId: "payment-existing",
    });

    const state = await new CheckoutSaga(
      actionPorts,
      store,
      noopTracer,
      noopMetrics,
    ).execute(input);

    expect(state.step).toBe("COMPLETED");
    expect(actionPorts.reserveStock).not.toHaveBeenCalled();
    expect(actionPorts.placeOrder).not.toHaveBeenCalled();
    expect(actionPorts.authorizePayment).not.toHaveBeenCalled();
    expect(actionPorts.confirmOrder).toHaveBeenCalledWith("order-1");
  });

  it("refunds payment, cancels order and releases stock using fallback deadlines", async () => {
    const actionPorts = ports();
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    const saga = new CheckoutSaga(actionPorts, store, noopTracer, noopMetrics);
    const compensate = (
      saga as unknown as {
        compensate: (state: CheckoutSagaState) => Promise<void>;
      }
    ).compensate.bind(saga);

    await compensate({
      sagaId: "saga-compensate",
      step: "PAYMENT_AUTHORIZED",
      paymentId: "payment-1",
      orderId: "order-1",
      reservationId: "reservation-1",
    });

    expect(actionPorts.refundPayment).toHaveBeenCalledWith("payment-1");
    expect(actionPorts.cancelOrder).toHaveBeenCalledWith("order-1");
    expect(actionPorts.releaseStock).toHaveBeenCalledWith("reservation-1");
    expect((await store.load("saga-compensate"))?.step).toBe("COMPENSATED");
  });

  it("persists compensation state when no forward step completed", async () => {
    const actionPorts = ports();
    const store = new InMemorySagaStateStore<CheckoutSagaState>();
    const saga = new CheckoutSaga(actionPorts, store, noopTracer, noopMetrics);
    const compensate = (
      saga as unknown as {
        compensate: (state: CheckoutSagaState) => Promise<void>;
      }
    ).compensate.bind(saga);

    await compensate({ sagaId: "saga-empty", step: "STARTED" });

    expect(actionPorts.refundPayment).not.toHaveBeenCalled();
    expect(actionPorts.cancelOrder).not.toHaveBeenCalled();
    expect(actionPorts.releaseStock).not.toHaveBeenCalled();
    expect((await store.load("saga-empty"))?.step).toBe("COMPENSATED");
  });
});
