import {
  executeSagaStep,
  SagaStateStore,
} from "@shared/application/saga/saga-state";
import type { TracerPort } from "@shared/application/observability/tracer.port";
import type { MetricsPort } from "@shared/application/observability/metrics.port";

export type CancellationRefundStep =
  "STARTED" | "ORDER_CANCELLED" | "STOCK_RELEASED" | "REFUNDED" | "COMPLETED";

export interface CancellationRefundState {
  sagaId: string;
  orderId: string;
  step: CancellationRefundStep;
  paymentId?: string;
  deadlineAt?: number;
}

const SAGA_TIMEOUT_MS = 120_000;
const STEP_POLICY = {
  timeoutMs: 15_000,
  maxAttempts: 3,
  backoffMs: 100,
} as const;

export interface CancellationRefundPorts {
  cancelOrder(orderId: string): Promise<void>;
  releaseStock(orderId: string): Promise<void>;
  refund(paymentId: string): Promise<void>;
}

export class CancellationRefundSaga {
  constructor(
    private readonly ports: CancellationRefundPorts,
    private readonly stateStore: SagaStateStore<CancellationRefundState>,
    private readonly tracer: TracerPort,
    private readonly metrics: MetricsPort,
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
      deadlineAt: Date.now() + SAGA_TIMEOUT_MS,
    };
    const deadlineAt = state.deadlineAt ?? Date.now() + SAGA_TIMEOUT_MS;
    state = { ...state, deadlineAt };
    if (state.step === "STARTED") {
      this.metrics.increment("saga.compensation", {
        saga: "cancellation-refund",
        step: "cancel-order",
      });
      await executeSagaStep(
        "cancellation.cancel-order",
        () =>
          this.tracer.withSpan("saga.cancellation.cancel_order", () =>
            this.ports.cancelOrder(state.orderId),
          ),
        STEP_POLICY,
        deadlineAt,
      );
      state = { ...state, step: "ORDER_CANCELLED" };
      await this.stateStore.save(input.sagaId, state);
    }
    if (state.step === "ORDER_CANCELLED") {
      this.metrics.increment("saga.compensation", {
        saga: "cancellation-refund",
        step: "release-stock",
      });
      await executeSagaStep(
        "cancellation.release-stock",
        () =>
          this.tracer.withSpan("saga.cancellation.release_stock", () =>
            this.ports.releaseStock(state.orderId),
          ),
        STEP_POLICY,
        deadlineAt,
      );
      state = { ...state, step: "STOCK_RELEASED" };
      await this.stateStore.save(input.sagaId, state);
    }
    if (state.step === "STOCK_RELEASED" && state.paymentId) {
      this.metrics.increment("saga.compensation", {
        saga: "cancellation-refund",
        step: "refund",
      });
      await executeSagaStep(
        "cancellation.refund",
        () =>
          this.tracer.withSpan("saga.cancellation.refund", () =>
            this.ports.refund(state.paymentId!),
          ),
        STEP_POLICY,
        deadlineAt,
      );
      state = { ...state, step: "REFUNDED" };
      await this.stateStore.save(input.sagaId, state);
    }
    state = { ...state, step: "COMPLETED" };
    await this.stateStore.save(input.sagaId, state);
    return state;
  }
}
