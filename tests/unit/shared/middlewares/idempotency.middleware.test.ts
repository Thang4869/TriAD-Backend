import { describe, it, expect, vi, beforeEach } from "vitest";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { Request, Response, NextFunction } from "express";
import redis from "@core/redis/client";
import {
  BadRequestError,
  ConflictError,
  UnprocessableEntityError,
} from "@shared/utils/errors";
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

  it("should throw BadRequestError if Idempotency-Key header missing", async () => {
    const middleware = idempotencyMiddleware();
    await middleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
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

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(
      UnprocessableEntityError,
    );
  });

  it("returns 409 when an identical request is already in progress", async () => {
    const requestHash = crypto.createHash("sha256").update("{}").digest("hex");
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({ state: "IN_PROGRESS", requestHash }),
    );
    req.headers = { "idempotency-key": "progress-key" };

    await idempotencyMiddleware()(req as Request, res as Response, next);

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(ConflictError);
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
});
