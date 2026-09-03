import { describe, it, expect, vi, beforeEach } from "vitest";
import redis from "@core/redis/client";

vi.mock("@core/redis/client", () => ({
  default: {
    setex: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
  },
}));

describe("idempotency utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should cache response with ttl", async () => {
    const { cacheIdempotentResponse } =
      await import("@shared/utils/idempotency");
    await cacheIdempotentResponse("key1", { data: "value" }, 3600);
    expect(redis.setex).toHaveBeenCalledWith(
      "idempotent:key1",
      3600,
      JSON.stringify({ data: "value" }),
    );
  });

  it("should use default TTL when not provided", async () => {
    process.env.IDEMPOTENCY_TTL = "12345";
    const { cacheIdempotentResponse } =
      await import("@shared/utils/idempotency");
    await cacheIdempotentResponse("key2", { data: "value" });
    expect(redis.setex).toHaveBeenCalledWith(
      "idempotent:key2",
      12345,
      JSON.stringify({ data: "value" }),
    );
    delete process.env.IDEMPOTENCY_TTL;
  });

  it("should get cached response if exists", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({ data: "value" }),
    );
    const { getCachedIdempotentResponse } =
      await import("@shared/utils/idempotency");
    const result = await getCachedIdempotentResponse("key1");
    expect(result).toEqual({ data: "value" });
  });

  it("should return null if no cache", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);
    const { getCachedIdempotentResponse } =
      await import("@shared/utils/idempotency");
    const result = await getCachedIdempotentResponse("key1");
    expect(result).toBeNull();
  });
});
