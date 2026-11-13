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
});
