import { PrismaSagaStateStore } from "@core/outbox/prisma-saga-state.store";
import { CheckoutSaga, CheckoutSagaPorts } from "./checkout.saga";

export function createCheckoutSaga(ports: CheckoutSagaPorts): CheckoutSaga {
  return new CheckoutSaga(ports, new PrismaSagaStateStore("CheckoutSaga"));
}
