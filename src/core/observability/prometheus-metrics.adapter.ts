import type {
  ApplicationMetric,
  ApplicationObservation,
  MetricLabels,
  MetricsPort,
} from "@shared/application/observability/metrics.port";
import {
  checkoutStageDurationSeconds,
  checkoutTransactionAttempts,
  checkoutFailed,
  checkoutTransactionConflicts,
  checkoutTransactionDurationSeconds,
  checkoutTransactionRetries,
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

      case "checkout.transaction.conflict":
      case "checkout.transaction.retry": {
        const category = labels?.category;

        if (
          category !== "transaction_conflict" &&
          category !== "product_stock_conflict"
        ) {
          throw new Error(
            `Metric "${metric}" requires a valid conflict category`,
          );
        }

        const counter =
          metric === "checkout.transaction.conflict"
            ? checkoutTransactionConflicts
            : checkoutTransactionRetries;

        counter.inc({ category });
        return;
      }

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

  observe(
    metric: ApplicationObservation,
    value: number,
    labels?: MetricLabels,
  ): void {
    switch (metric) {
      case "checkout.transaction.duration":
        checkoutTransactionDurationSeconds.observe(
          { outcome: String(labels?.outcome ?? "unknown") },
          value / 1000,
        );
        return;

      case "checkout.transaction.attempts":
        checkoutTransactionAttempts.observe(
          { outcome: String(labels?.outcome ?? "unknown") },
          value,
        );
        return;

      case "checkout.stage.duration":
        checkoutStageDurationSeconds.observe(
          { stage: String(labels?.stage ?? "unknown") },
          value / 1000,
        );
        return;
    }
  }
}
