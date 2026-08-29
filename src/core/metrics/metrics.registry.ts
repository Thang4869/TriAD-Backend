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