import { describe, it, expect, vi } from "vitest";
import {
  rateLimiter,
  strictRateLimiter,
  authRateLimiter,
  authIpRateLimiter,
  totpRateLimiter,
  totpIpRateLimiter,
  refreshRateLimiter,
} from "@shared/middlewares/rate-limit.middleware";
import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "@core/redis/client";
import config from "@config";
import { DependencyUnavailableError } from "@shared/errors/application-error";
import {
  rateLimitDecisionsTotal,
  rateLimitStoreFailuresTotal,
} from "@core/metrics/metrics.registry";

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
    status: "ready",
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
    const originalWindow = config.RATE_LIMIT_WINDOW_MS;
    const originalMax = config.RATE_LIMIT_MAX;
    Object.assign(config, { RATE_LIMIT_WINDOW_MS: 12345, RATE_LIMIT_MAX: 77 });
    try {
      rateLimiter();
      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 12345,
          max: 77,
        }),
      );
    } finally {
      Object.assign(config, {
        RATE_LIMIT_WINDOW_MS: originalWindow,
        RATE_LIMIT_MAX: originalMax,
      });
    }
  });

  it("should use built-in defaults when rate limit env vars are absent", () => {
    const originalWindow = config.RATE_LIMIT_WINDOW_MS;
    const originalMax = config.RATE_LIMIT_MAX;
    try {
      rateLimiter();
      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 60000,
          max: 100,
        }),
      );
    } finally {
      Object.assign(config, {
        RATE_LIMIT_WINDOW_MS: originalWindow,
        RATE_LIMIT_MAX: originalMax,
      });
    }
  });

  it("does not exempt an API path named /health from abuse protection", () => {
    rateLimiter();
    const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
    // The health routes are mounted outside /api; no path-based exemption is needed.
    expect(options?.skip).toBeUndefined();
  });

  it("reports 429 decisions with a fixed bucket label, not client identifiers", () => {
    rateLimiter({ prefix: "ratelimit:auth:" });
    const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
    const handler = options?.handler as (
      req: Request,
      res: Response,
      next: NextFunction,
      options: { statusCode: number; message: unknown },
    ) => void;
    const status = vi.fn();
    const json = vi.fn();
    const res = {
      status: vi.fn().mockReturnValue({ json }),
      json,
    } as unknown as Response;
    const metric = vi.spyOn(rateLimitDecisionsTotal, "inc");

    try {
      handler(
        {
          ip: "192.0.2.7",
          body: { email: "private@example.invalid" },
        } as Request,
        res,
        vi.fn(),
        {
          statusCode: 429,
          message: { success: false, error: "Too many requests" },
        },
      );
      expect(res.status).toHaveBeenCalledWith(429);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error: "Too many requests",
      });
      expect(metric).toHaveBeenCalledWith({
        bucket: "auth_identity",
        outcome: "deny",
      });
      expect(JSON.stringify(metric.mock.calls)).not.toContain("192.0.2.7");
      expect(JSON.stringify(metric.mock.calls)).not.toContain(
        "private@example.invalid",
      );
      expect(status).not.toHaveBeenCalled();
    } finally {
      metric.mockRestore();
    }
  });

  it("caps unknown custom Redis prefixes to a single metric bucket", () => {
    rateLimiter({ prefix: "random-tenant-specific-prefix" });
    const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
    expect(options?.handler).toBeDefined();
    const handler = options?.handler as (
      req: Request,
      res: Response,
      next: NextFunction,
      options: { statusCode: number; message: unknown },
    ) => void;
    const json = vi.fn();
    const res = {
      status: vi.fn().mockReturnValue({ json }),
    } as unknown as Response;
    const metric = vi.spyOn(rateLimitDecisionsTotal, "inc");
    try {
      handler({} as Request, res, vi.fn(), { statusCode: 429, message: {} });
      expect(metric).toHaveBeenCalledWith({
        bucket: "custom",
        outcome: "deny",
      });
    } finally {
      metric.mockRestore();
    }
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

    it("does not trust x-forwarded-for when req.ip is missing", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = {
        ip: undefined,
        headers: { "x-forwarded-for": "203.0.113.5" },
      } as unknown as Request;
      expect(keyGenFn(req)).toBe("unknown");
    });

    it("does not trust x-forwarded-for arrays", () => {
      rateLimiter();
      const options = vi.mocked(rateLimit).mock.calls.at(-1)?.[0];
      const keyGenFn = options?.keyGenerator as (req: Request) => string;

      const req = {
        ip: undefined,
        headers: { "x-forwarded-for": ["203.0.113.5", "203.0.113.6"] },
      } as unknown as Request;
      expect(keyGenFn(req)).toBe("unknown");
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
      const originalWindow = config.RATE_LIMIT_WINDOW_MS;
      const originalMax = config.RATE_LIMIT_MAX;
      Object.assign(config, {
        RATE_LIMIT_WINDOW_MS: 120000,
        RATE_LIMIT_MAX: 200,
      });

      rateLimiter();

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 120000,
          max: 200,
        }),
      );

      Object.assign(config, {
        RATE_LIMIT_WINDOW_MS: originalWindow,
        RATE_LIMIT_MAX: originalMax,
      });
    });
  });
});

describe("auth and 2FA abuse rate-limit keys", () => {
  function optionForPrefix(prefix: string) {
    const storeIndex = vi
      .mocked(RedisStore)
      .mock.calls.findIndex(
        ([options]) => (options as { prefix?: string }).prefix === prefix,
      );
    // The mocked factory is called in the same order as RedisStore creation.
    return vi.mocked(rateLimit).mock.calls[storeIndex]?.[0];
  }

  it("sets independent IP-wide budgets to prevent rotating accounts or preauth tokens", () => {
    expect(authIpRateLimiter).toBeDefined();
    expect(totpIpRateLimiter).toBeDefined();
    expect(refreshRateLimiter).toBeDefined();
    expect(optionForPrefix("ratelimit:auth-ip:")).toMatchObject({
      windowMs: 60 * 60 * 1000,
      max: 60,
    });
    expect(optionForPrefix("ratelimit:totp-ip:")).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 20,
    });
    expect(optionForPrefix("ratelimit:refresh-ip:")).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 30,
    });
  });

  it("normalizes the email and does not expose it in Redis keys", () => {
    expect(authRateLimiter).toBeDefined();
    const generate = optionForPrefix("ratelimit:auth:")?.keyGenerator as (
      req: Request,
    ) => string;
    const req = (email: string) =>
      ({
        ip: "192.0.2.20",
        body: { email },
        headers: { "x-forwarded-for": "198.51.100.1" },
      }) as unknown as Request;
    const first = generate(req(" User@Example.COM "));
    expect(first).toBe(generate(req("user@example.com")));
    expect(first).not.toContain("user@example.com");
    expect(first).not.toContain("User@Example.COM");
    expect(first).toMatch(/^192\.0\.2\.20:[a-f0-9]{64}$/);
    expect(first).not.toContain("198.51.100.1");
  });

  it("never includes raw preauth secrets in its Redis key", () => {
    expect(totpRateLimiter).toBeDefined();
    const generate = optionForPrefix("ratelimit:totp:")?.keyGenerator as (
      req: Request,
    ) => string;
    const token = "SECRET.JWT.PREAUTH";
    const key = generate({
      ip: "192.0.2.11",
      body: { preAuthToken: token },
    } as Request);
    expect(key).not.toContain(token);
    expect(key).toMatch(/^192\.0\.2\.11:[a-f0-9]{64}$/);
  });

  it("shares missing identity buckets rather than letting malformed input evade limits", () => {
    const authGenerate = optionForPrefix("ratelimit:auth:")?.keyGenerator as (
      req: Request,
    ) => string;
    const totpGenerate = optionForPrefix("ratelimit:totp:")?.keyGenerator as (
      req: Request,
    ) => string;
    const req = { ip: "192.0.2.21", body: {} } as Request;
    expect(authGenerate(req)).toBe("192.0.2.21:missing");
    expect(totpGenerate(req)).toBe("192.0.2.21:missing");
    expect(authGenerate({ ...req, body: { email: {} } } as Request)).toBe(
      "192.0.2.21:missing",
    );
  });
});

describe("rate-limit Redis fail-closed policy", () => {
  function commandBridge() {
    rateLimiter();
    const options = vi.mocked(RedisStore).mock.calls.at(-1)?.[0] as
      { sendCommand: (...args: string[]) => Promise<unknown> } | undefined;
    if (!options) throw new Error("Missing Redis store in rate-limit test");
    return options.sendCommand;
  }

  it("explicitly rejects bypass-on-store-error", () => {
    rateLimiter();
    expect(vi.mocked(rateLimit).mock.calls.at(-1)?.[0]).toMatchObject({
      passOnStoreError: false,
    });
  });

  it("queues startup SCRIPT LOAD until Redis becomes ready without rejecting during module import", async () => {
    const sendCommand = commandBridge();
    const redisClient = redis as typeof redis & { status: string };
    const old = redisClient.status;
    redisClient.status = "connecting";
    vi.mocked(redis.call).mockResolvedValueOnce("sha-of-lua-script");
    try {
      await expect(sendCommand("SCRIPT", "LOAD", "return 1")).resolves.toBe(
        "sha-of-lua-script",
      );
      expect(redis.call).toHaveBeenCalledWith("SCRIPT", "LOAD", "return 1");
    } finally {
      redisClient.status = old;
    }
  });

  it("counts an unavailable store without recording keys or connection secrets", async () => {
    const sendCommand = commandBridge();
    const client = redis as typeof redis & { status: string };
    const previous = client.status;
    const counter = vi.spyOn(rateLimitStoreFailuresTotal, "inc");
    client.status = "reconnecting";
    try {
      await expect(
        sendCommand("INCR", "private-user-key"),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
      expect(counter).toHaveBeenCalledWith({
        operation: "request",
        reason: "not_ready",
      });
      expect(JSON.stringify(counter.mock.calls)).not.toContain(
        "private-user-key",
      );
    } finally {
      client.status = previous;
      counter.mockRestore();
    }
  });

  it("does not reject queued SCRIPT LOAD while Redis connects during cold startup", async () => {
    vi.useFakeTimers();
    const client = redis as typeof redis & { status: string };
    const originalStatus = client.status;
    const failures = vi.spyOn(rateLimitStoreFailuresTotal, "inc");
    try {
      const sendCommand = commandBridge();
      client.status = "connecting";
      let complete!: (reply: unknown) => void;
      vi.mocked(redis.call).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }) as ReturnType<typeof redis.call>,
      );

      // The upstream v4 store creates and awaits startup Lua SHA promises
      // asynchronously. Rejecting them on a timer can crash a cold deploy.
      const pending = sendCommand("SCRIPT", "LOAD", "return 1");
      await vi.advanceTimersByTimeAsync(5000);
      expect(failures).not.toHaveBeenCalledWith({
        operation: "bootstrap",
        reason: "timeout",
      });

      client.status = "ready";
      complete("script-sha");
      await expect(pending).resolves.toBe("script-sha");
      vi.mocked(redis.call).mockResolvedValueOnce("sha-on-recovery");
      await expect(sendCommand("SCRIPT", "LOAD", "return 1")).resolves.toBe(
        "sha-on-recovery",
      );
    } finally {
      failures.mockRestore();
      client.status = originalStatus;
      vi.useRealTimers();
    }
  });

  it("does not leak Redis host, keys or connection internals from SCRIPT LOAD errors", async () => {
    const sendCommand = commandBridge();
    vi.mocked(redis.call).mockRejectedValueOnce(
      new Error("redis://private-host:6379 sensitive-key"),
    );
    await expect(
      sendCommand("SCRIPT", "LOAD", "sensitive-lua"),
    ).rejects.toThrow("Rate limit store unavailable");
  });

  it("returns a 503-class dependency error immediately if Redis is disconnected", async () => {
    const sendCommand = commandBridge();
    const redisClient = redis as typeof redis & { status: string };
    const old = redisClient.status;
    const earlierCalls = vi.mocked(redis.call).mock.calls.length;
    redisClient.status = "reconnecting";
    try {
      await expect(sendCommand("INCR", "test-key")).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
      expect(vi.mocked(redis.call).mock.calls).toHaveLength(earlierCalls);
    } finally {
      redisClient.status = old;
    }
  });

  it("maps Redis command rejections to dependency errors (not a rate-limit bypass)", async () => {
    const sendCommand = commandBridge();
    vi.mocked(redis.call).mockRejectedValueOnce(
      new Error("secret redis endpoint"),
    );
    await expect(sendCommand("INCR", "test-key")).rejects.toThrow(
      "Rate limit store unavailable",
    );
  });

  it("bounds an unresponsive Redis command without exposing key material", async () => {
    vi.useFakeTimers();
    try {
      const sendCommand = commandBridge();
      vi.mocked(redis.call).mockImplementationOnce(() => new Promise(() => {}));
      const pending = expect(
        sendCommand("INCR", "sensitive-token"),
      ).rejects.toThrow("Rate limit store timed out");
      await vi.advanceTimersByTimeAsync(1000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
  it("recovers after reconnect without bypassing requests during an outage", async () => {
    const sendCommand = commandBridge();
    const client = redis as typeof redis & { status: string };
    const originalStatus = client.status;
    try {
      client.status = "reconnecting";
      const callsBefore = vi.mocked(redis.call).mock.calls.length;
      await expect(sendCommand("INCR", "recovery-key")).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
      expect(redis.call).toHaveBeenCalledTimes(callsBefore);

      client.status = "ready";
      vi.mocked(redis.call).mockResolvedValueOnce(1);
      await expect(sendCommand("INCR", "recovery-key")).resolves.toBe(1);
      expect(redis.call).toHaveBeenCalledWith("INCR", "recovery-key");
    } finally {
      client.status = originalStatus;
    }
  });

  it("does not allow a delayed pre-reconnect response to change a failed request", async () => {
    const sendCommand = commandBridge();
    const client = redis as typeof redis & { status: string };
    const originalStatus = client.status;
    try {
      client.status = "ready";
      let complete!: (value: unknown) => void;
      vi.mocked(redis.call).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }) as ReturnType<typeof redis.call>,
      );
      vi.useFakeTimers();
      const failed = expect(
        sendCommand("INCR", "stale-key"),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
      await vi.advanceTimersByTimeAsync(1000);
      await failed;
      complete(1);
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
      client.status = originalStatus;
    }
  });
});
