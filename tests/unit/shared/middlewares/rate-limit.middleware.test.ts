import { describe, it, expect, vi } from "vitest";
import {
  rateLimiter,
  strictRateLimiter,
  authRateLimiter,
} from "@shared/middlewares/rate-limit.middleware";
import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

vi.mock("express-rate-limit", () => ({
  default: vi.fn().mockImplementation((_options) => {
    return (req: Request, res: Response, next: NextFunction) => next();
  }),
}));

vi.mock("rate-limit-redis", () => ({
  RedisStore: vi.fn(),
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

  it("should skip health and admin users", () => {
    rateLimiter();
    const options = vi.mocked(rateLimit).mock.calls[0]?.[0];
    expect(options).toBeDefined();
    const skipFn = options?.skip;
    expect(skipFn).toBeDefined();

    const mockRes = {} as Response;
    const healthReq = { path: "/health", user: { role: "USER" } } as Request;
    const adminReq = { path: "/api", user: { role: "ADMIN" } } as Request;
    const normalReq = { path: "/api", user: { role: "USER" } } as Request;

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
});
