export type ApplicationMetric =
  | "orders.placed"
  | "stock.reservation.succeeded"
  | "stock.reservation.failed"
  | "checkout.saga.succeeded"
  | "checkout.saga.failed"
  | "checkout.transaction.conflict"
  | "checkout.transaction.retry"
  | "saga.compensation";

export type ApplicationObservation =
  | "checkout.transaction.duration"
  | "checkout.transaction.attempts"
  | "checkout.stage.duration";

export type MetricLabels = Record<string, string | number>;

export interface MetricsPort {
  increment(metric: ApplicationMetric, labels?: MetricLabels): void;
  observe?(
    metric: ApplicationObservation,
    value: number,
    labels?: MetricLabels,
  ): void;
}
