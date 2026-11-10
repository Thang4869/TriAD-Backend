import { setupCheckout, runCheckout, teardownCheckout } from "./lib/checkout.js";

const vus = Number(__ENV.K6_VUS || 10);
const duration = __ENV.K6_DURATION || "2m";
const p95 = Number(__ENV.K6_P95_MS || 2500);
const p99 = Number(__ENV.K6_P99_MS || 5000);
const errorRate = Number(__ENV.K6_ERROR_RATE || 0.01);

export const options = {
  scenarios: {
    hot_product_contention: { executor: "constant-vus", vus, duration },
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
  runCheckout(data, data.hotProductId);
}

export function teardown(data) {
  teardownCheckout(data);
}
