import {
  FeatureFlag,
  FeatureFlagPort,
} from "@shared/application/feature-flags/feature-flag.port";
import {
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
}

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
    };
    await this.stateStore.save(input.sagaId, state);

    try {
      if (!state.reservationId) {
        state = {
          ...state,
          step: "STOCK_RESERVED",
          reservationId: await this.ports.reserveStock(input),
        };
        await this.stateStore.save(input.sagaId, state);
      }
      if (!state.orderId) {
        state = {
          ...state,
          step: "ORDER_PLACED",
          orderId: await this.ports.placeOrder(input),
        };
        await this.stateStore.save(input.sagaId, state);
      }
      if (!state.paymentId && input.paymentMethod !== "COD") {
        state = {
          ...state,
          step: "PAYMENT_AUTHORIZED",
          paymentId: await this.ports.authorizePayment(input, state.orderId!),
        };
        await this.stateStore.save(input.sagaId, state);
      }
      if (
        this.featureFlags?.isEnabled(FeatureFlag.NewCheckoutFlow, {
          userId: input.userId,
        }) !== false
      ) {
        await withSpan("saga.checkout.confirm", () =>
          this.ports.confirmOrder(state.orderId!),
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
    if (state.paymentId) await this.ports.refundPayment(state.paymentId);
    if (state.orderId) await this.ports.cancelOrder(state.orderId);
    if (state.reservationId) await this.ports.releaseStock(state.reservationId);
    await this.stateStore.save(state.sagaId, { ...state, step: "COMPENSATED" });
  }
}
