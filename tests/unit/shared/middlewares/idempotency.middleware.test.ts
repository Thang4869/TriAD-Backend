import { describe, it, expect, vi, beforeEach } from "vitest";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { Request, Response, NextFunction } from "express";
import redis from "@core/redis/client";
import { BadRequestError } from "@shared/utils/errors";

vi.mock("@core/redis/client", () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
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

  it("should throw BadRequestError if Idempotency-Key header missing", async () => {
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("should return cached response if exists", async () => {
    const cached = JSON.stringify({ status: 200, data: { id: "order-1" } });
    vi.mocked(redis.get).mockResolvedValueOnce(cached);
    req.headers = { "idempotency-key": "key1" };
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "order-1" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should attach idempotencyKey to body and override res.json to cache", async () => {
    req.headers = { "idempotency-key": "key2" };
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(req.body.idempotencyKey).toBe("key2");
    expect(next).toHaveBeenCalledWith();

    (res as any).json({ success: true });
    expect(redis.setex).toHaveBeenCalledWith(
      "idempotent:key2",
      expect.any(Number),
      JSON.stringify({ status: 200, data: { success: true } }),
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
        "idempotent:key2-env-ttl",
        3600,
        JSON.stringify({ status: 200, data: { success: true } }),
      );
    } finally {
      process.env.IDEMPOTENCY_TTL = original;
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
});
