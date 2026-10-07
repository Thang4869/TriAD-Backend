import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withSpan: vi.fn(),
}));

vi.mock("@core/tracing/span", () => ({
  withSpan: mocks.withSpan,
}));

import { OpenTelemetryTracerAdapter } from "@core/observability/opentelemetry-tracer.adapter";

describe("OpenTelemetryTracerAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates span execution and attributes to core tracing", async () => {
    const setAttributes = vi.fn();

    mocks.withSpan.mockImplementation(
      async (
        _name: string,
        operation: (
          setAttributes: (
            attributes: Record<string, string | number | boolean>,
          ) => void,
        ) => Promise<unknown>,
      ) => operation(setAttributes),
    );

    const adapter = new OpenTelemetryTracerAdapter();

    const result = await adapter.withSpan(
      "checkout.test",
      async (setSpanAttributes) => {
        setSpanAttributes({
          "checkout.order_id": "order-1",
        });

        return "done";
      },
      {
        "checkout.user_id": "user-1",
      },
    );

    expect(result).toBe("done");

    expect(mocks.withSpan).toHaveBeenCalledWith(
      "checkout.test",
      expect.any(Function),
      {
        "checkout.user_id": "user-1",
      },
    );

    expect(setAttributes).toHaveBeenCalledWith({
      "checkout.order_id": "order-1",
    });
  });
});
