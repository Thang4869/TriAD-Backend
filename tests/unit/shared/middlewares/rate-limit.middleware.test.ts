import { describe, it, expect, vi } from "vitest";
import {
  rateLimiter,
  strictRateLimiter,
  authRateLimiter,
} from "@shared/middlewares/rate-limit.middleware";
import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "@core/redis/client";

vi.mock("express-rate-limit", () => ({
  default: vi.fn().mockImplementation((_options) => {
    return (req: Request, res: Response, next: NextFunction) => next();
  }),
}));

vi.mock("rate-limit-redis", () => ({
  RedisStore: vi.fn(),
}));

vi.mock("@core/redis/client", () => ({
  default: {
    call: vi.fn(),
  },
}));

describe("rate-limit middleware", () => {
  it("should create rate limiter with default options", () => {
    const limiter = rateLimiter();
    expect(limiter).toBeInstanceOf(Function);
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  });

  it("should use custom window and max", () => {
    rateLimiter({ windowMs: 30000, max: 50 });
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 30000,
        max: 50,
      }),
    );
  });

  it("should preserve explicitly provided zero values", () => {
    rateLimiter({ windowMs: 0, max: 0 });
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 0,
        max: 0,
      }),
    );
  });

  it("should fall back to RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX env vars when no options given", () => {
    const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;
    const originalMax = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_WINDOW_MS = "12345";
    process.env.RATE_LIMIT_MAX = "77";
    try {
      rateLimiter();
      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 12345,
          max: 77,
        }),
      );
    } finally {
      process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
      process.env.RATE_LIMIT_MAX = originalMax;
    }
  });

  it("should use built-in defaults when rate limit env vars are absent", () => {
    const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;
    const originalMax = process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX;
    try {
      rateLimiter();
      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 60000,
          max: 100,
        }),
      );
    } finally {
      process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
      process.env.RATE_LIMIT_MAX = originalMax;
    }
  });

  it("should skip health and admin users", () => {
    rateLimiter();
    const options = vi.mocked(rateLimit).mock.calls[0]?.[0];
    expect(options).toBeDefined();
    const skipFn = options?.skip;
    expect(skipFn).toBeDefined();

    const mockRes = {} as Response;
    const healthReq = {
      path: "/health",
      user: { role: "USER" },
    } as unknown as Request;
    const adminReq = {
      path: "/api",
      user: { role: "ADMIN" },
    } as unknown as Request;
    const normalReq = {
      path: "/api",
      user: { role: "USER" },
    } as unknown as Request;

    expect(skipFn?.(healthReq, mockRes)).toBe(true);
    expect(skipFn?.(adminReq, mockRes)).toBe(true);
    expect(skipFn?.(normalReq, mockRes)).toBe(false);
  });

  it("should create strictRateLimiter with 50 max and 15min window", () => {
    expect(strictRateLimiter).toBeDefined();
    const calls = vi.mocked(rateLimit).mock.calls;
    const found = calls.some(
      (call) => call?.[0]?.windowMs === 15 * 60 * 1000 && call?.[0]?.max === 50,
    );
    expect(found).toBe(true);
  });

  it("should create authRateLimiter with 10 max and 1h window", () => {
    expect(authRateLimiter).toBeDefined();
    const calls = vi.mocked(rateLimit).mock.calls;
    const found = calls.some(
      (call) => call?.[0]?.windowMs === 60 * 60 * 1000 && call?.[0]?.max === 10,
    );
    expect(found).toBe(true);
  });

  it("should forward commands to redis via the RedisStore sendCommand bridge", async () => {
    rateLimiter();
    const storeOptions = vi.mocked(RedisStore).mock.calls.at(-1)?.[0] as
      { sendCommand: (...args: string[]) => Promise<unknown> } | undefined;
    expect(storeOptions?.sendCommand).toBeDefined();

    vi.mocked(redis.call).mockResolvedValueOnce("OK");
    const result = await storeOptions?.sendCommand("INCR", "some-key");

    expect(redis.call).toHaveBeenCalledWith("INCR", "some-key");
    expect(result).toBe("OK");
  });

  it("should use the provided custom keyGenerator instead of the default", () => {
    const customKeyGenerator = vi.fn().mockReturnValue("custom-key");
    rateLimiter({ keyGenerator: customKeyGenerator });
    const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];

    expect(options?.keyGenerator).toBe(customKeyGenerator);
  });

  describe("default keyGenerator", () => {
    it("returns req.ip when present", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = { ip: "10.0.0.1", headers: {} } as unknown as Request;
      expect(keyGenFn(req)).toBe("10.0.0.1");
    });

    it("falls back to x-forwarded-for string header when req.ip is missing", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = {
        ip: undefined,
        headers: { "x-forwarded-for": "203.0.113.5" },
      } as unknown as Request;
      expect(keyGenFn(req)).toBe("203.0.113.5");
    });

    it("uses the first entry when x-forwarded-for is an array", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = {
        ip: undefined,
        headers: { "x-forwarded-for": ["203.0.113.5", "203.0.113.6"] },
      } as unknown as Request;
      expect(keyGenFn(req)).toBe("203.0.113.5");
    });

    it("returns 'unknown' when x-forwarded-for array is empty", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = {
        ip: undefined,
        headers: { "x-forwarded-for": [] },
      } as unknown as Request;
      expect(keyGenFn(req)).toBe("unknown");
    });

    it("returns 'unknown' when neither req.ip nor x-forwarded-for exist", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = { ip: undefined, headers: {} } as unknown as Request;
      expect(keyGenFn(req)).toBe("unknown");
    });

    it("should use RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX from environment when set", () => {
      const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;
      const originalMax = process.env.RATE_LIMIT_MAX;
      process.env.RATE_LIMIT_WINDOW_MS = "120000";
      process.env.RATE_LIMIT_MAX = "200";

      rateLimiter();

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 120000,
          max: 200,
        }),
      );

      process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
      process.env.RATE_LIMIT_MAX = originalMax;
    });
  });
});
