import type {
  ApplicationMetric,
  MetricLabels,
  MetricsPort,
} from "@shared/application/observability/metrics.port";
import {
  checkoutFailed,
  checkoutSucceeded,
  ordersPlaced,
  sagaCompensations,
  stockReservationFailed,
  stockReservationSucceeded,
} from "@core/metrics/metrics.registry";

export class PrometheusMetricsAdapter implements MetricsPort {
  increment(metric: ApplicationMetric, labels?: MetricLabels): void {
    switch (metric) {
      case "orders.placed":
        ordersPlaced.inc();
        return;

      case "stock.reservation.succeeded":
        stockReservationSucceeded.inc();
        return;

      case "stock.reservation.failed":
        stockReservationFailed.inc();
        return;

      case "checkout.saga.succeeded":
        checkoutSucceeded.inc();
        return;

      case "checkout.saga.failed":
        checkoutFailed.inc();
        return;

      case "saga.compensation": {
        const saga = labels?.saga;
        const step = labels?.step;

        if (typeof saga !== "string" || typeof step !== "string") {
          throw new Error(
            'Metric "saga.compensation" requires string labels "saga" and "step"',
          );
        }

        sagaCompensations.inc({
          saga,
          step,
        });
        return;
      }
    }
  }
}
