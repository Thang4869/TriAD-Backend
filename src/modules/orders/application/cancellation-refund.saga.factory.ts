import { PrismaSagaStateStore } from "@core/outbox/prisma-saga-state.store";
import {
  CancellationRefundPorts,
  CancellationRefundSaga,
} from "./cancellation-refund.saga";

export function createCancellationRefundSaga(
  ports: CancellationRefundPorts,
): CancellationRefundSaga {
  return new CancellationRefundSaga(
    ports,
    new PrismaSagaStateStore("CancellationRefundSaga"),
  );
}
