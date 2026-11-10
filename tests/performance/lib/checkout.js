/* global __ENV, __VU, __ITER */
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

export const checkoutDuration = new Trend("checkout_duration", true);
export const cartAddFailures = new Rate("cart_add_failure_rate");
export const checkoutFailures = new Rate("checkout_failure_rate");
export const checkoutSuccesses = new Counter("checkout_successes");
export const checkoutConflicts = new Counter("checkout_http_conflicts");
export const cartAddHttpStatuses = new Counter("cart_add_http_status");
export const checkoutHttpStatuses = new Counter("checkout_http_status");

let cartFailureSampleLogged = false;
let checkoutFailureSampleLogged = false;

function requiredEnv(name) {
  const value = __ENV[name];
  if (!value) throw new Error(name + " is required");
  return value;
}

function counterValue(metricsText, metricName) {
  const match = metricsText.match(
    new RegExp("^" + metricName + "\\s+([0-9.eE+-]+)$", "m"),
  );
  return match ? Number(match[1]) : 0;
}

function readContentionMetrics(baseUrl) {
  const response = http.get(baseUrl + "/metrics", {
    tags: { name: "benchmark_metrics_scrape" },
  });

  if (response.status !== 200) {
    throw new Error(
      "GET /metrics must return 200 in the local development benchmark environment",
    );
  }

  const body = String(response.body || "");

  return {
    conflicts: counterValue(
      body,
      "triad_backend_checkout_transaction_conflicts_total",
    ),
    retries: counterValue(
      body,
      "triad_backend_checkout_transaction_retries_total",
    ),
  };
}

function logFailureSample(label, response, alreadyLogged) {
  if (alreadyLogged) return true;

  const body = String(response.body || "").slice(0, 300);
  console.error(
    label + " failure sample: status=" + response.status + " body=" + body,
  );

  return true;
}

export function setupCheckout() {
  const baseUrl = requiredEnv("K6_BASE_URL").replace(/\/+$/, "");

  const target = baseUrl.match(
    /^([a-z][a-z0-9+.-]*):\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d+))?(?:[/?#]|$)/i,
  );

  if (!target) {
    throw new Error("K6_BASE_URL must be a valid absolute HTTP(S) URL");
  }

  const protocol = target[1].toLowerCase() + ":";
  const hostname = target[2].toLowerCase();
  const port = target[3] ? Number(target[3]) : null;

  if (port !== null && (port < 1 || port > 65535)) {
    throw new Error("K6_BASE_URL must use a valid TCP port");
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

  if (protocol !== "https:" && !(protocol === "http:" && loopback)) {
    throw new Error("K6_BASE_URL must use HTTPS, or HTTP on loopback only");
  }

  if (!loopback && __ENV.K6_ALLOW_REMOTE !== "true") {
    throw new Error(
      "Remote load targets require explicit K6_ALLOW_REMOTE=true",
    );
  }

  const emails = JSON.parse(requiredEnv("K6_BENCH_EMAILS"));
  const productIds = JSON.parse(requiredEnv("K6_PRODUCT_IDS"));

  if (
    !Array.isArray(emails) ||
    !emails.length ||
    !Array.isArray(productIds) ||
    productIds.length < emails.length
  ) {
    throw new Error(
      "K6_BENCH_EMAILS and K6_PRODUCT_IDS must be JSON arrays with one entry per VU",
    );
  }

  const users = [];

  for (const email of emails) {
    const response = http.post(
      baseUrl + "/api/auth/login",
      JSON.stringify({
        email,
        password: requiredEnv("K6_BENCH_PASSWORD"),
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "benchmark_login" },
      },
    );

    const token = response.cookies?.accessToken?.[0]?.value;

    if (response.status !== 200 || !token) {
      throw new Error(
        "Benchmark login failed; check fixture credentials and local API readiness",
      );
    }

    users.push(token);
  }

  const vus = Number(__ENV.K6_VUS || 5);

  if (!Number.isInteger(vus) || vus < 1 || vus > users.length) {
    throw new Error(
      "K6_VUS must be between 1 and the number of seeded benchmark users",
    );
  }

  return {
    baseUrl,
    runId: requiredEnv("K6_RUN_ID"),
    users,
    productIds,
    hotProductId: requiredEnv("K6_HOT_PRODUCT_ID"),
    metricsBefore: readContentionMetrics(baseUrl),
  };
}

export function runCheckout(data, productId) {
  const token = data.users[__VU - 1];

  if (!token) {
    throw new Error("No seeded benchmark account is assigned to this VU");
  }

  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  const addItem = http.post(
    data.baseUrl + "/api/cart/items",
    JSON.stringify({ productId, quantity: 1 }),
    { headers, tags: { name: "benchmark_cart_add" } },
  );

  const cartAdded = addItem.status === 201;

  cartAddFailures.add(!cartAdded);
  cartAddHttpStatuses.add(1, { status: String(addItem.status) });

  if (!check(addItem, { "cart fixture added": () => cartAdded })) {
    cartFailureSampleLogged = logFailureSample(
      "Cart add",
      addItem,
      cartFailureSampleLogged,
    );
    return;
  }

  const response = http.post(
    data.baseUrl + "/api/checkout",
    JSON.stringify({
      paymentMethod: "COD",
      address: "Local performance benchmark address",
      phone: "0900000000",
    }),
    {
      headers: {
        ...headers,
        "Idempotency-Key": data.runId + "-" + __VU + "-" + __ITER,
      },
      tags: { name: "benchmark_checkout" },
    },
  );

  checkoutDuration.add(response.timings.duration);

  const succeeded = response.status === 201;

  checkoutFailures.add(!succeeded);
  checkoutHttpStatuses.add(1, { status: String(response.status) });

  if (succeeded) {
    checkoutSuccesses.add(1);
  }

  if (response.status === 409) {
    checkoutConflicts.add(1);
  }

  if (!succeeded) {
    checkoutFailureSampleLogged = logFailureSample(
      "Checkout",
      response,
      checkoutFailureSampleLogged,
    );
  }

  check(response, { "checkout created": () => succeeded });
}

export function teardownCheckout(data) {
  const after = readContentionMetrics(data.baseUrl);

  console.log(
    "CHECKOUT_CONTENTION_METRICS " +
      JSON.stringify({
        transactionConflicts: after.conflicts - data.metricsBefore.conflicts,
        transactionRetries: after.retries - data.metricsBefore.retries,
      }),
  );
}
