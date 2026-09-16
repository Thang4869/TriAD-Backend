import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import { withSpan } from "@core/tracing/span";

// `span.ts` gọi trace.getTracer() ngay khi module được load, nên phải mock ở
// tầng module (vi.mock được hoist lên trước import) thay vì spyOn sau đó.
const mocks = vi.hoisted(() => {
  const span = {
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return { span };
});

vi.mock("@opentelemetry/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@opentelemetry/api")>();
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getTracer: () => ({
        startActiveSpan: (_name: string, fn: (s: unknown) => unknown) =>
          fn(mocks.span),
      }),
    },
  };
});

const span = mocks.span;

describe("withSpan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả về kết quả của hàm bên trong và đóng span", async () => {
    const result = await withSpan("op", async () => "value");

    expect(result).toBe("value");
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it("đặt status OK khi không có lỗi", async () => {
    await withSpan("op", async () => "value");

    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.recordException).not.toHaveBeenCalled();
  });

  it("gán attributes khởi tạo lên span", async () => {
    await withSpan("op", async () => null, { "stock.sku_count": 3 });

    expect(span.setAttributes).toHaveBeenCalledWith({ "stock.sku_count": 3 });
  });

  it("không gọi setAttributes khi không truyền attributes", async () => {
    await withSpan("op", async () => null);

    expect(span.setAttributes).not.toHaveBeenCalled();
  });

  it("callback setAttributes cho phép bổ sung attribute trong lúc chạy", async () => {
    await withSpan("op", async (setAttributes) => {
      setAttributes({ "stock.locked_product_count": 2 });
      return null;
    });

    expect(span.setAttributes).toHaveBeenCalledWith({
      "stock.locked_product_count": 2,
    });
  });

  it("ghi exception, đặt status ERROR kèm message rồi ném lại lỗi", async () => {
    const boom = new Error("boom");

    await expect(
      withSpan("op", async () => {
        throw boom;
      }),
    ).rejects.toThrow("boom");

    expect(span.recordException).toHaveBeenCalledWith(boom);
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "boom",
    });
  });

  it("span luôn được end() kể cả khi có lỗi", async () => {
    await withSpan("op", async () => {
      throw new Error("boom");
    }).catch(() => undefined);

    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it("lỗi không phải Error được chuyển thành chuỗi trong status message", async () => {
    await withSpan("op", async () => {
      throw "chuỗi lỗi";
    }).catch(() => undefined);

    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "chuỗi lỗi",
    });
  });
});
