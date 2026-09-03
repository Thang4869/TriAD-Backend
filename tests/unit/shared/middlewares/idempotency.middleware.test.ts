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
});
