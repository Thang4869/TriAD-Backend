import {
  FeatureFlag,
  FeatureFlagPort,
} from "@shared/application/feature-flags/feature-flag.port";
import {
  executeSagaStep,
  InMemorySagaStateStore,
  SagaStateStore,
} from "@shared/application/saga/saga-state";
import { withSpan } from "@core/tracing/span";

export type CheckoutSagaStep =
  | "STARTED"
  | "STOCK_RESERVED"
  | "ORDER_PLACED"
  | "PAYMENT_AUTHORIZED"
  | "COMPLETED"
  | "COMPENSATED";

export interface CheckoutSagaState {
  sagaId: string;
  orderId?: string;
  step: CheckoutSagaStep;
  reservationId?: string;
  paymentId?: string;
  deadlineAt?: number;
}

const SAGA_TIMEOUT_MS = 120_000;
const STEP_POLICY = {
  timeoutMs: 15_000,
  maxAttempts: 3,
  backoffMs: 100,
} as const;

export interface CheckoutSagaPorts {
  reserveStock(input: CheckoutInput): Promise<string>;
  releaseStock(reservationId: string): Promise<void>;
  placeOrder(input: CheckoutInput): Promise<string>;
  cancelOrder(orderId: string): Promise<void>;
  authorizePayment(input: CheckoutInput, orderId: string): Promise<string>;
  refundPayment(paymentId: string): Promise<void>;
  confirmOrder(orderId: string): Promise<void>;
}

export interface CheckoutInput {
  sagaId: string;
  userId: string;
  total: number;
  paymentMethod: string;
  items: ReadonlyArray<{ productId: string; quantity: number }>;
}

export class CheckoutSaga {
  constructor(
    private readonly ports: CheckoutSagaPorts,
    private readonly stateStore: SagaStateStore<CheckoutSagaState> = new InMemorySagaStateStore(),
    private readonly featureFlags?: FeatureFlagPort,
  ) {}

  async execute(input: CheckoutInput): Promise<CheckoutSagaState> {
    let state: CheckoutSagaState = (await this.stateStore.load(
      input.sagaId,
    )) ?? {
      sagaId: input.sagaId,
      step: "STARTED",
      deadlineAt: Date.now() + SAGA_TIMEOUT_MS,
    };
    const deadlineAt = state.deadlineAt ?? Date.now() + SAGA_TIMEOUT_MS;
    state = { ...state, deadlineAt };
    await this.stateStore.save(input.sagaId, state);

    try {
      if (!state.reservationId) {
        state = {
          ...state,
          step: "STOCK_RESERVED",
          reservationId: await executeSagaStep(
            "checkout.reserve-stock",
            () => this.ports.reserveStock(input),
            STEP_POLICY,
            deadlineAt,
          ),
        };
        await this.stateStore.save(input.sagaId, state);
      }
      if (!state.orderId) {
        state = {
          ...state,
          step: "ORDER_PLACED",
          orderId: await executeSagaStep(
            "checkout.place-order",
            () => this.ports.placeOrder(input),
            STEP_POLICY,
            deadlineAt,
          ),
        };
        await this.stateStore.save(input.sagaId, state);
      }
      if (!state.paymentId && input.paymentMethod !== "COD") {
        state = {
          ...state,
          step: "PAYMENT_AUTHORIZED",
          paymentId: await executeSagaStep(
            "checkout.authorize-payment",
            () => this.ports.authorizePayment(input, state.orderId!),
            STEP_POLICY,
            deadlineAt,
          ),
        };
        await this.stateStore.save(input.sagaId, state);
      }
      if (
        this.featureFlags?.isEnabled(FeatureFlag.NewCheckoutFlow, {
          userId: input.userId,
        }) !== false
      ) {
        await executeSagaStep(
          "checkout.confirm-order",
          () =>
            withSpan("saga.checkout.confirm", () =>
              this.ports.confirmOrder(state.orderId!),
            ),
          STEP_POLICY,
          deadlineAt,
        );
      }
      state = { ...state, step: "COMPLETED" };
      await this.stateStore.save(input.sagaId, state);
      return state;
    } catch (error) {
      await this.compensate(state);
      throw error;
    }
  }

  private async compensate(state: CheckoutSagaState): Promise<void> {
    if (state.paymentId) {
      await executeSagaStep(
        "checkout.refund-payment",
        () => this.ports.refundPayment(state.paymentId!),
        STEP_POLICY,
        state.deadlineAt ?? Date.now() + SAGA_TIMEOUT_MS,
      );
    }
    if (state.orderId) {
      await executeSagaStep(
        "checkout.cancel-order",
        () => this.ports.cancelOrder(state.orderId!),
        STEP_POLICY,
        state.deadlineAt ?? Date.now() + SAGA_TIMEOUT_MS,
      );
    }
    if (state.reservationId) {
      await executeSagaStep(
        "checkout.release-stock",
        () => this.ports.releaseStock(state.reservationId!),
        STEP_POLICY,
        state.deadlineAt ?? Date.now() + SAGA_TIMEOUT_MS,
      );
    }
    await this.stateStore.save(state.sagaId, { ...state, step: "COMPENSATED" });
  }
}
