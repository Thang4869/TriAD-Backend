import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ordersPlaced: { inc: vi.fn() },
  stockReservationSucceeded: { inc: vi.fn() },
  stockReservationFailed: { inc: vi.fn() },
  checkoutSucceeded: { inc: vi.fn() },
  checkoutFailed: { inc: vi.fn() },
  sagaCompensations: { inc: vi.fn() },
}));

vi.mock("@core/metrics/metrics.registry", () => mocks);

import { PrometheusMetricsAdapter } from "@core/observability/prometheus-metrics.adapter";

describe("PrometheusMetricsAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["orders.placed", mocks.ordersPlaced],
    ["stock.reservation.succeeded", mocks.stockReservationSucceeded],
    ["stock.reservation.failed", mocks.stockReservationFailed],
    ["checkout.saga.succeeded", mocks.checkoutSucceeded],
    ["checkout.saga.failed", mocks.checkoutFailed],
  ] as const)("increments %s", (metric, counter) => {
    const adapter = new PrometheusMetricsAdapter();

    adapter.increment(metric);

    expect(counter.inc).toHaveBeenCalledTimes(1);
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
