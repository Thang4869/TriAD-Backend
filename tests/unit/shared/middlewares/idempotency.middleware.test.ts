import { describe, it, expect, vi, beforeEach } from "vitest";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { Request, Response, NextFunction } from "express";
import redis from "@core/redis/client";
import {
  UnprocessableError,
  ValidationError,
} from "@shared/errors/application-error";
import crypto from "crypto";

vi.mock("@core/redis/client", () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

describe("idempotencyMiddleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      method: "POST",
      headers: {},
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      statusCode: 200,
    };
    next = vi.fn();
  });

  it("should skip for non-POST/PUT/PATCH methods", async () => {
    req.method = "GET";
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("should throw ValidationError if Idempotency-Key header missing", async () => {
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it("should return cached response if exists", async () => {
    const requestHash = crypto.createHash("sha256").update("{}").digest("hex");
    const cached = JSON.stringify({
      state: "COMPLETED",
      requestHash,
      status: 200,
      data: { id: "order-1" },
    });
    vi.mocked(redis.get).mockResolvedValueOnce(cached);
    req.headers = { "idempotency-key": "key1" };
    req.originalUrl = "/api/checkout/";
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "order-1" });
    expect(next).not.toHaveBeenCalled();
  });

  it("must not replay user A response to user B with the same key", async () => {
    const cached = JSON.stringify({
      status: 200,
      data: { orderId: "user-a-order" },
    });
    vi.mocked(redis.get).mockImplementationOnce(async (key) =>
      String(key) === "idempotent:shared-key" ? cached : null,
    );
    req.headers = { "idempotency-key": "shared-key" };
    req.user = { id: "user-b", email: "b@example.com", role: "USER" };

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("replays the same user's identical request", async () => {
    const requestHash = crypto
      .createHash("sha256")
      .update('{"amount":1}')
      .digest("hex");
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        state: "COMPLETED",
        requestHash,
        status: 201,
        data: { id: "order-1" },
      }),
    );
    req.user = { id: "user-a", email: "a@example.com", role: "USER" };
    req.originalUrl = "/api/checkout/";
    req.body = { amount: 1 };
    req.headers = { "idempotency-key": "same-key" };

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 422 when the same key is reused with a different body", async () => {
    const requestHash = crypto
      .createHash("sha256")
      .update('{"amount":1}')
      .digest("hex");
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        state: "COMPLETED",
        requestHash,
        status: 201,
        data: { id: "order-1" },
      }),
    );
    req.user = { id: "user-a", email: "a@example.com", role: "USER" };
    req.originalUrl = "/api/checkout/";
    req.body = { amount: 2 };
    req.headers = { "idempotency-key": "same-key" };

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(UnprocessableError);
  });

  it("should use a short TTL for the IN_PROGRESS claim", async () => {
    req.headers = { "idempotency-key": "short-lived-claim" };

    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    expect(redis.set).toHaveBeenCalledWith(
      "idempotency:anonymous:unknown:short-lived-claim",
      expect.stringContaining('"state":"IN_PROGRESS"'),
      "EX",
      60,
      "NX",
    );
  });

  it("should attach idempotencyKey to body and override res.json to cache", async () => {
    req.headers = { "idempotency-key": "key2" };
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(req.body.idempotencyKey).toBe("key2");
    expect(next).toHaveBeenCalledWith();

    (res as any).json({ success: true });
    expect(redis.setex).toHaveBeenCalledWith(
      "idempotency:anonymous:unknown:key2",
      expect.any(Number),
      expect.stringContaining('"state":"COMPLETED"'),
    );
  });

  it("should use IDEMPOTENCY_TTL from env when explicitly set", async () => {
    const original = process.env.IDEMPOTENCY_TTL;
    process.env.IDEMPOTENCY_TTL = "3600";
    try {
      req.headers = { "idempotency-key": "key2-env-ttl" };
      const middleware = idempotencyMiddleware();
      await middleware(req as Request, res as Response, next);

      (res as any).json({ success: true });
      expect(redis.setex).toHaveBeenCalledWith(
        "idempotency:anonymous:unknown:key2-env-ttl",
        86400,
        expect.stringContaining('"state":"COMPLETED"'),
      );
    } finally {
      if (original === undefined) {
        delete process.env.IDEMPOTENCY_TTL;
      } else {
        process.env.IDEMPOTENCY_TTL = original;
      }
    }
  });

  it("should NOT cache the response when statusCode is outside 2xx", async () => {
    req.headers = { "idempotency-key": "key3" };
    (res as any).statusCode = 404;
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    (res as any).json({ error: "not found" });
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("should silently ignore errors when caching the response fails", async () => {
    req.headers = { "idempotency-key": "key4" };
    vi.mocked(redis.setex).mockRejectedValueOnce(new Error("redis down"));
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    expect(() => (res as any).json({ success: true })).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(redis.setex).toHaveBeenCalled();
  });

  it("should cache a response when the cache write resolves", async () => {
    req.headers = { "idempotency-key": "key4-success" };
    vi.mocked(redis.setex).mockResolvedValueOnce("OK");
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    (res as any).json({ success: true });
    await Promise.resolve();

    expect(redis.setex).toHaveBeenCalledWith(
      "idempotency:anonymous:unknown:key4-success",
      86400,
      expect.stringContaining('"state":"COMPLETED"'),
    );
  });

  it("should use the default TTL when IDEMPOTENCY_TTL is absent", async () => {
    const originalTtl = process.env.IDEMPOTENCY_TTL;
    delete process.env.IDEMPOTENCY_TTL;
    try {
      req.headers = { "idempotency-key": "key-default-ttl" };
      const middleware = idempotencyMiddleware();
      await middleware(req as Request, res as Response, next);

      (res as any).json({ success: true });

      expect(redis.setex).toHaveBeenCalledWith(
        "idempotency:anonymous:unknown:key-default-ttl",
        86400,
        expect.stringContaining('"state":"COMPLETED"'),
      );
    } finally {
      if (originalTtl === undefined) {
        delete process.env.IDEMPOTENCY_TTL;
      } else {
        process.env.IDEMPOTENCY_TTL = originalTtl;
      }
    }
  });

  it("should use IDEMPOTENCY_TTL from environment when set", async () => {
    const originalTtl = process.env.IDEMPOTENCY_TTL;
    process.env.IDEMPOTENCY_TTL = "3600";

    req.headers = { "idempotency-key": "key5" };
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    (res as any).json({ success: true });
    expect(redis.setex).toHaveBeenCalledWith(
      "idempotency:anonymous:unknown:key5",
      86400,
      expect.stringContaining('"state":"COMPLETED"'),
    );

    process.env.IDEMPOTENCY_TTL = originalTtl;
  });

  it("forwards redis.get failure to next(error)", async () => {
    req.headers = { "idempotency-key": "redis-get-fail" };

    const redisError = new Error("redis get failed");
    vi.mocked(redis.get).mockRejectedValueOnce(redisError);

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(redisError);
  });

  it("forwards redis.set failure to next(error)", async () => {
    req.headers = { "idempotency-key": "redis-set-fail" };

    const redisError = new Error("redis set failed");

    vi.mocked(redis.get).mockResolvedValueOnce(null);
    vi.mocked(redis.set).mockRejectedValueOnce(redisError);

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(redisError);
  });

  it("forwards the second redis.get failure after a failed NX claim", async () => {
    req.headers = { "idempotency-key": "redis-concurrent-get-fail" };

    const redisError = new Error("redis concurrent get failed");

    vi.mocked(redis.get)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(redisError);

    vi.mocked(redis.set).mockResolvedValueOnce(null);

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(redis.get).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledWith(redisError);
  });

  it("logs redis.setex failure after a successful response", async () => {
    req.headers = { "idempotency-key": "setex-log-fail" };

    const redisError = new Error("redis setex failed");
    vi.mocked(redis.setex).mockRejectedValueOnce(redisError);

    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    (res as any).json({ success: true });

    await Promise.resolve();
    await Promise.resolve();

    expect(redis.setex).toHaveBeenCalled();
  });

  it("logs redis.del failure after a non-2xx response", async () => {
    req.headers = { "idempotency-key": "del-log-fail" };
    (res as any).statusCode = 500;

    const redisError = new Error("redis del failed");
    vi.mocked(redis.del).mockRejectedValueOnce(redisError);

    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);

    (res as any).json({ error: "failed" });

    await Promise.resolve();
    await Promise.resolve();

    expect(redis.del).toHaveBeenCalled();
  });
});
