export type ApplicationMetric =
  | "orders.placed"
  | "stock.reservation.succeeded"
  | "stock.reservation.failed"
  | "checkout.saga.succeeded"
  | "checkout.saga.failed"
  | "saga.compensation";

export type MetricLabels = Record<string, string | number>;

export interface MetricsPort {
  increment(metric: ApplicationMetric, labels?: MetricLabels): void;
}
