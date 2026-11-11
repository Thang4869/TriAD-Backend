import {
  setupCheckout,
  runCheckout,
  teardownCheckout,
} from "./lib/checkout.js";

const vus = Number(__ENV.TRIAD_PERF_VUS || 5);
const duration = __ENV.TRIAD_PERF_DURATION || "2m";
const p95 = Number(__ENV.TRIAD_PERF_P95_MS || 1500);
const p99 = Number(__ENV.TRIAD_PERF_P99_MS || 3000);
const errorRate = Number(__ENV.TRIAD_PERF_ERROR_RATE || 0.01);

export const options = {
  scenarios: {
    checkout_baseline: { executor: "constant-vus", vus, duration },
  },
  thresholds: {
    checkout_duration: ["p(95)<" + p95, "p(99)<" + p99],
    checkout_failure_rate: ["rate<" + errorRate],
  },
};

export function setup() {
  return setupCheckout();
}

export default function (data) {
  runCheckout(data, data.productIds[__VU - 1], "checkout_baseline");
}

export function teardown(data) {
  teardownCheckout(data);
}
