import {
  InMemorySagaStateStore,
  SagaStateStore,
} from "@shared/application/saga/saga-state";
import { withSpan } from "@core/tracing/span";

export type CancellationRefundStep =
  "STARTED" | "ORDER_CANCELLED" | "STOCK_RELEASED" | "REFUNDED" | "COMPLETED";

export interface CancellationRefundState {
  sagaId: string;
  orderId: string;
  step: CancellationRefundStep;
  paymentId?: string;
}

export interface CancellationRefundPorts {
  cancelOrder(orderId: string): Promise<void>;
  releaseStock(orderId: string): Promise<void>;
  refund(paymentId: string): Promise<void>;
}

export class CancellationRefundSaga {
  constructor(
    private readonly ports: CancellationRefundPorts,
    private readonly stateStore: SagaStateStore<CancellationRefundState> = new InMemorySagaStateStore(),
  ) {}

  async execute(input: {
    sagaId: string;
    orderId: string;
    paymentId?: string;
  }): Promise<CancellationRefundState> {
    let state = (await this.stateStore.load(input.sagaId)) ?? {
      sagaId: input.sagaId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      step: "STARTED" as const,
    };
    if (state.step === "STARTED") {
      await withSpan("saga.cancellation.cancel_order", () =>
        this.ports.cancelOrder(state.orderId),
      );
      state = { ...state, step: "ORDER_CANCELLED" };
      await this.stateStore.save(input.sagaId, state);
    }
    if (state.step === "ORDER_CANCELLED") {
      await withSpan("saga.cancellation.release_stock", () =>
        this.ports.releaseStock(state.orderId),
      );
      state = { ...state, step: "STOCK_RELEASED" };
      await this.stateStore.save(input.sagaId, state);
    }
    if (state.step === "STOCK_RELEASED" && state.paymentId) {
      await withSpan("saga.cancellation.refund", () =>
        this.ports.refund(state.paymentId!),
      );
      state = { ...state, step: "REFUNDED" };
      await this.stateStore.save(input.sagaId, state);
    }
    state = { ...state, step: "COMPLETED" };
    await this.stateStore.save(input.sagaId, state);
    return state;
  }
}
