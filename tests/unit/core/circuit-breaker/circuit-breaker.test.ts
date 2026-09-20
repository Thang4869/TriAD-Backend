import { describe, it, expect, vi, beforeEach } from "vitest";
import CircuitBreakerCtor from "opossum";
import {
  withCircuitBreaker,
  withRetry,
} from "@core/circuit-breaker/circuit-breaker";
import { logger } from "@core/logger/winston";

vi.mock("@core/logger/winston", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("withCircuitBreaker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("truyền tham số và trả kết quả khi hàm gốc chạy bình thường", async () => {
    const fn = vi.fn(async (a: number, b: number) => a + b);
    const wrapped = withCircuitBreaker(fn, { name: "sum" });

    await expect(wrapped(2, 3)).resolves.toBe(5);
    expect(fn).toHaveBeenCalledWith(2, 3);
  });

  it("lỗi từ hàm gốc vẫn được ném ra cho caller", async () => {
    const wrapped = withCircuitBreaker(
      async () => {
        throw new Error("upstream down");
      },
      { name: "failing" },
    );

    await expect(wrapped()).rejects.toThrow("upstream down");
  });

  it("mở mạch sau khi vượt ngưỡng lỗi và fail-fast các call sau đó", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always fails");
    });
    const wrapped = withCircuitBreaker(fn, {
      name: "breaker-open",
      errorThresholdPercentage: 1,
      resetTimeout: 10_000,
    });

    for (let i = 0; i < 12; i++) {
      await wrapped().catch(() => undefined);
    }

    const callsBefore = fn.mock.calls.length;
    await wrapped().catch(() => undefined);

    expect(fn.mock.calls.length).toBe(callsBefore);
    expect(logger.warn).toHaveBeenCalledWith(
      "Circuit breaker opened for breaker-open",
    );
  });

  it("timeout ngắn khiến call bị hủy dù hàm gốc chưa xong", async () => {
    const wrapped = withCircuitBreaker(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
      { name: "slow", timeout: 20 },
    );

    await expect(wrapped()).rejects.toThrow();
  });

  it("chuyển half-open rồi close khi resetTimeout hết hạn và request kế tiếp thành công", async () => {
    let shouldFail = true;
    const fn = vi.fn(async () => {
      if (shouldFail) throw new Error("still failing");
      return "recovered";
    });
    const wrapped = withCircuitBreaker(fn, {
      name: "half-open-flow",
      errorThresholdPercentage: 1,
      resetTimeout: 50,
    });

    for (let i = 0; i < 12; i++) {
      await wrapped().catch(() => undefined);
    }
    expect(logger.warn).toHaveBeenCalledWith(
      "Circuit breaker opened for half-open-flow",
    );

    shouldFail = false;
    await new Promise((resolve) => setTimeout(resolve, 80));

    await expect(wrapped()).resolves.toBe("recovered");
    expect(logger.warn).toHaveBeenCalledWith(
      "Circuit breaker half-open for half-open-flow",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Circuit breaker closed for half-open-flow",
    );
  });

  it("ghi log cảnh báo khi breaker phát sự kiện fallback", () => {
    const onSpy = vi.spyOn(CircuitBreakerCtor.prototype, "on");

    withCircuitBreaker(async () => "x", { name: "fallback-test" });

    // opossum tự đăng ký listener "fallback" nội bộ khi khởi tạo breaker,
    // nên lấy lần đăng ký "fallback" CUỐI CÙNG (chính là listener của chúng ta
    // được gắn sau khi breaker đã được tạo).
    const fallbackCall = [...onSpy.mock.calls]
      .reverse()
      .find(
        ([event]: [string, (...args: any[]) => void]) => event === "fallback",
      );
    expect(fallbackCall).toBeDefined();

    const fallbackHandler = fallbackCall?.[1] as () => void;
    fallbackHandler();

    expect(logger.warn).toHaveBeenCalledWith(
      "Circuit breaker fallback for fallback-test",
    );

    onSpy.mockRestore();
  });
});

describe("withRetry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("không retry khi lần đầu đã thành công", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("thử lại và thành công ở lần thứ hai", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("ok");

    await expect(
      withRetry(fn, { retries: 3, minTimeout: 1, maxTimeout: 5 }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("ném lỗi cuối cùng sau khi hết số lần retry", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));

    await expect(
      withRetry(fn, { retries: 2, minTimeout: 1, maxTimeout: 5 }),
    ).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("ghi log cảnh báo cho mỗi lần retry", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("ok");

    await withRetry(fn, { retries: 2, minTimeout: 1, maxTimeout: 5 });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Retry attempt 1"),
    );
  });

  it("retries = 0 nghĩa là không thử lại lần nào", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));

    await expect(withRetry(fn, { retries: 0 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
