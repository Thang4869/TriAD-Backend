import client from "prom-client";

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "triad_backend_",
});

export const httpRequestDuration = new client.Histogram({
  name: "triad_backend_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new client.Counter({
  name: "triad_backend_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});

export const queueJobsWaiting = new client.Gauge({
  name: "triad_backend_queue_jobs_waiting",
  help: "Number of jobs waiting in queue",
  labelNames: ["queue_name"],
  registers: [metricsRegistry],
});

export const queueJobsFailed = new client.Counter({
  name: "triad_backend_queue_jobs_failed_total",
  help: "Total number of failed queue jobs",
  labelNames: ["queue_name"],
  registers: [metricsRegistry],
});

export const ordersPlaced = new client.Counter({
  name: "triad_backend_orders_placed_total",
  help: "Orders successfully placed",
  registers: [metricsRegistry],
});

export const stockReservationFailed = new client.Counter({
  name: "triad_backend_stock_reservation_failed_total",
  help: "Stock reservation failures",
  registers: [metricsRegistry],
});

export const stockReservationSucceeded = new client.Counter({
  name: "triad_backend_stock_reservation_success_total",
  help: "Successful stock reservations",
  registers: [metricsRegistry],
});

export const checkoutSucceeded = new client.Counter({
  name: "triad_backend_checkout_success_total",
  help: "Successful checkout sagas",
  registers: [metricsRegistry],
});

export const checkoutFailed = new client.Counter({
  name: "triad_backend_checkout_failure_total",
  help: "Failed checkout sagas",
  registers: [metricsRegistry],
});

export const sagaCompensations = new client.Counter({
  name: "triad_backend_saga_compensation_total",
  help: "Saga compensations executed",
  labelNames: ["saga", "step"],
  registers: [metricsRegistry],
});

export const projectionLagSeconds = new client.Gauge({
  name: "triad_backend_projection_lag_seconds",
  help: "Age of the event when a projection handler processed it",
  labelNames: ["projection"],
  registers: [metricsRegistry],
});

export const outboxEventsClaimed = new client.Counter({
  name: "triad_backend_outbox_events_claimed_total",
  help: "Outbox events claimed for delivery",
  registers: [metricsRegistry],
});

export const outboxEventsPublished = new client.Counter({
  name: "triad_backend_outbox_events_published_total",
  help: "Outbox events published successfully",
  registers: [metricsRegistry],
});

export const outboxEventsFailed = new client.Counter({
  name: "triad_backend_outbox_events_failed_total",
  help: "Outbox event delivery failures",
  registers: [metricsRegistry],
});

export const outboxEventsDeadLettered = new client.Counter({
  name: "triad_backend_outbox_events_dead_lettered_total",
  help: "Outbox events moved to the dead-letter state",
  registers: [metricsRegistry],
});

export const outboxLagSeconds = new client.Gauge({
  name: "triad_backend_outbox_lag_seconds",
  help: "Age in seconds of the oldest unpublished outbox event",
  registers: [metricsRegistry],
});
