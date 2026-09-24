import { describe, expect, it, vi } from "vitest";
import {
  CheckoutSaga,
  CheckoutSagaPorts,
  CheckoutSagaState,
} from "@modules/checkout/application/checkout.saga";
import { InMemorySagaStateStore } from "@shared/application/saga/saga-state";

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
    const actionPorts = ports();
    const state = await new CheckoutSaga(actionPorts).execute(input);

    expect(state.step).toBe("COMPLETED");
    expect(actionPorts.confirmOrder).toHaveBeenCalledWith("order-1");
  });

  it("compensates completed forward steps when payment fails", async () => {
    const actionPorts = ports();
    vi.mocked(actionPorts.authorizePayment).mockRejectedValue(
      new Error("payment down"),
    );

    await expect(new CheckoutSaga(actionPorts).execute(input)).rejects.toThrow(
      "payment down",
    );
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

    await new CheckoutSaga(actionPorts, store).execute(input);

    expect(actionPorts.reserveStock).not.toHaveBeenCalled();
    expect(actionPorts.placeOrder).not.toHaveBeenCalled();
  });
});
