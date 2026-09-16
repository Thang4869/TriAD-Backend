import { describe, it, expect, vi, beforeEach } from "vitest";
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

    // Đủ số lần lỗi để opossum mở mạch (mặc định cần >= 10 request trong volume window,
    // nhưng lỗi liên tiếp với threshold 1% sẽ mở ngay khi đủ mẫu).
    for (let i = 0; i < 12; i++) {
      await wrapped().catch(() => undefined);
    }

    const callsBefore = fn.mock.calls.length;
    await wrapped().catch(() => undefined);

    // Khi mạch đã mở, hàm gốc không còn được gọi nữa.
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
