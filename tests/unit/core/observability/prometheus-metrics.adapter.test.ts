import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ordersPlaced: { inc: vi.fn() },
  stockReservationSucceeded: { inc: vi.fn() },
  stockReservationFailed: { inc: vi.fn() },
  checkoutSucceeded: { inc: vi.fn() },
  checkoutFailed: { inc: vi.fn() },
  checkoutTransactionConflicts: { inc: vi.fn() },
  checkoutTransactionRetries: { inc: vi.fn() },
  sagaCompensations: { inc: vi.fn() },
  checkoutTransactionDurationSeconds: { observe: vi.fn() },
  checkoutTransactionAttempts: { observe: vi.fn() },
  checkoutStageDurationSeconds: { observe: vi.fn() },
}));

vi.mock("@core/metrics/metrics.registry", () => mocks);

import { PrometheusMetricsAdapter } from "@core/observability/prometheus-metrics.adapter";

describe("PrometheusMetricsAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      metric: "checkout.transaction.conflict",
      counter: mocks.checkoutTransactionConflicts,
      category: "transaction_conflict",
    },
    {
      metric: "checkout.transaction.conflict",
      counter: mocks.checkoutTransactionConflicts,
      category: "product_stock_conflict",
    },
    {
      metric: "checkout.transaction.retry",
      counter: mocks.checkoutTransactionRetries,
      category: "transaction_conflict",
    },
    {
      metric: "checkout.transaction.retry",
      counter: mocks.checkoutTransactionRetries,
      category: "product_stock_conflict",
    },
  ] as const)(
    "increments $metric with category $category",
    ({ metric, counter, category }) => {
      const adapter = new PrometheusMetricsAdapter();

      adapter.increment(metric, { category });

      expect(counter.inc).toHaveBeenCalledWith({ category });
    },
  );

  it.each([
    ["checkout.transaction.conflict", "invalid"],
    ["checkout.transaction.conflict", ""],
    ["checkout.transaction.conflict", undefined],
    ["checkout.transaction.retry", "invalid"],
    ["checkout.transaction.retry", ""],
    ["checkout.transaction.retry", undefined],
  ] as const)("rejects invalid category for %s: %s", (metric, category) => {
    const adapter = new PrometheusMetricsAdapter();

    expect(() =>
      adapter.increment(metric, {
        ...(category === undefined ? {} : { category }),
      }),
    ).toThrow(`Metric "${metric}" requires a valid conflict category`);

    const counter =
      metric === "checkout.transaction.conflict"
        ? mocks.checkoutTransactionConflicts
        : mocks.checkoutTransactionRetries;

    expect(counter.inc).not.toHaveBeenCalled();
  });

  it("increments saga compensation with required labels", () => {
    const adapter = new PrometheusMetricsAdapter();

    adapter.increment("saga.compensation", {
      saga: "checkout",
      step: "release-stock",
    });

    expect(mocks.sagaCompensations.inc).toHaveBeenCalledWith({
      saga: "checkout",
      step: "release-stock",
    });
  });

  it("rejects saga compensation without required labels", () => {
    const adapter = new PrometheusMetricsAdapter();

    expect(() => adapter.increment("saga.compensation")).toThrow(
      'Metric "saga.compensation" requires string labels "saga" and "step"',
    );

    expect(mocks.sagaCompensations.inc).not.toHaveBeenCalled();
  });

  it.each([
    ["orders.placed", mocks.ordersPlaced],
    ["stock.reservation.succeeded", mocks.stockReservationSucceeded],
    ["stock.reservation.failed", mocks.stockReservationFailed],
    ["checkout.saga.succeeded", mocks.checkoutSucceeded],
    ["checkout.saga.failed", mocks.checkoutFailed],
  ] as const)("increments %s", (metric, counter) => {
    new PrometheusMetricsAdapter().increment(metric);

    expect(counter.inc).toHaveBeenCalledOnce();
  });

  it.each([
    ["checkout.transaction.duration", { outcome: "committed" }, 125, 0.125],
    ["checkout.transaction.attempts", { outcome: "retried" }, 3, 3],
    ["checkout.stage.duration", { stage: "reserve-stock" }, 250, 0.25],
  ] as const)(
    "observes %s with normalized value and labels",
    (metric, labels, value, expected) => {
      const adapter = new PrometheusMetricsAdapter();

      adapter.observe(metric, value, labels);

      const histogram =
        metric === "checkout.transaction.duration"
          ? mocks.checkoutTransactionDurationSeconds
          : metric === "checkout.transaction.attempts"
            ? mocks.checkoutTransactionAttempts
            : mocks.checkoutStageDurationSeconds;

      expect(histogram.observe).toHaveBeenCalledWith(labels, expected);
    },
  );

  it.each([
    ["checkout.transaction.duration", mocks.checkoutTransactionDurationSeconds],
    ["checkout.transaction.attempts", mocks.checkoutTransactionAttempts],
    ["checkout.stage.duration", mocks.checkoutStageDurationSeconds],
  ] as const)("uses fallback labels for %s", (metric, histogram) => {
    new PrometheusMetricsAdapter().observe(metric, 0);

    expect(histogram.observe).toHaveBeenCalledWith(
      metric === "checkout.stage.duration"
        ? { stage: "unknown" }
        : { outcome: "unknown" },
      0,
    );
  });
});
