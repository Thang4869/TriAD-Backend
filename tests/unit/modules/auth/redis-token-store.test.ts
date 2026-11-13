import { beforeEach, describe, expect, it, vi } from "vitest";
import redis from "@core/redis/client";
import { RedisTokenStore } from "@modules/auth/infrastructure/token-store/redis-token-store";

vi.mock("@core/redis/client", () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  },
}));

describe("RedisTokenStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a token by key", async () => {
    vi.mocked(redis.get).mockResolvedValue("token-value");
    await expect(new RedisTokenStore().get("token:key")).resolves.toBe(
      "token-value",
    );
    expect(redis.get).toHaveBeenCalledWith("token:key");
  });

  it("stores a token with its expiration", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    await new RedisTokenStore().set("token:key", "value", 60);
    expect(redis.set).toHaveBeenCalledWith("token:key", "value", "EX", 60);
  });

  it("deletes a token", async () => {
    vi.mocked(redis.del).mockResolvedValue(1);
    await new RedisTokenStore().delete("token:key");
    expect(redis.del).toHaveBeenCalledWith("token:key");
  });

  it("atomically returns and deletes an existing token", async () => {
    vi.mocked(redis.eval).mockResolvedValue("consumed");
    await expect(new RedisTokenStore().getAndDelete("token:key")).resolves.toBe(
      "consumed",
    );
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get'"),
      1,
      "token:key",
    );
  });

  it("returns null when the atomic consume script returns false or a non-string", async () => {
    vi.mocked(redis.eval).mockResolvedValue(0);
    await expect(
      new RedisTokenStore().getAndDelete("missing"),
    ).resolves.toBeNull();
  });

  it("returns true only when Redis accepts an NX write", async () => {
    const store = new RedisTokenStore();
    vi.mocked(redis.set)
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(null);
    await expect(store.setIfAbsent("key", "value", 30)).resolves.toBe(true);
    await expect(store.setIfAbsent("key", "value", 30)).resolves.toBe(false);
    expect(redis.set).toHaveBeenNthCalledWith(
      1,
      "key",
      "value",
      "EX",
      30,
      "NX",
    );
  });
});
