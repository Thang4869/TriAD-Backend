import { describe, it, expect, vi, beforeEach } from "vitest";

let mockRedisInstance: any;
let capturedOptions: any;
let capturedUrl: any;

vi.mock("ioredis", () => {
  const RedisCtor = vi.fn(function (this: any, url: string, options: any) {
    capturedUrl = url;
    capturedOptions = options;
    const instance = {
      on: vi.fn(),
      ping: vi.fn().mockResolvedValue("PONG"),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockRedisInstance = instance;
    return instance;
  });
  return { default: RedisCtor };
});

vi.mock("@core/logger/winston", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe("Redis client", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REDIS_URL = originalRedisUrl;
  });

  it("logs on connect event", async () => {
    const { logger } = await import("@core/logger/winston");
    await import("@core/redis/client");

    const connectCallback = mockRedisInstance.on.mock.calls.find(
      ([event]: [string]) => event === "connect",
    )?.[1];

    expect(connectCallback).toBeInstanceOf(Function);
    connectCallback();
    expect(logger.info).toHaveBeenCalledWith("Redis connected");
  });

  it("logs on error event", async () => {
    const { logger } = await import("@core/logger/winston");
    await import("@core/redis/client");

    const errorCallback = mockRedisInstance.on.mock.calls.find(
      ([event]: [string]) => event === "error",
    )?.[1];

    expect(errorCallback).toBeInstanceOf(Function);
    errorCallback(new Error("Redis down"));
    expect(logger.error).toHaveBeenCalledWith("Redis error", {
      error: "Redis down",
    });
  });

  it("configures the client with sane connection options", async () => {
    await import("@core/redis/client");

    expect(capturedOptions).toMatchObject({
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
    });
  });

  it("configures a retryStrategy that backs off linearly and caps at 2000ms", async () => {
    await import("@core/redis/client");

    expect(capturedOptions.retryStrategy).toBeInstanceOf(Function);
    expect(capturedOptions.retryStrategy(1)).toBe(50);
    expect(capturedOptions.retryStrategy(10)).toBe(500);
    expect(capturedOptions.retryStrategy(100)).toBe(2000);
  });

  it("connects using REDIS_URL from the environment when provided", async () => {
    process.env.REDIS_URL = "redis://custom-host:6380";

    await import("@core/redis/client");

    expect(capturedUrl).toBe("redis://custom-host:6380");
  });

  it("falls back to localhost when REDIS_URL is not set", async () => {
    delete process.env.REDIS_URL;

    await import("@core/redis/client");

    expect(capturedUrl).toBe("redis://localhost:6379");
  });

  it("exports the same client instance as both the named and default export", async () => {
    const clientModule = await import("@core/redis/client");

    expect(clientModule.default).toBe(clientModule.redis);
  });
});
