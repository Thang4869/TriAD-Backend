import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestLogger } from "@shared/middlewares/logger.middleware";
import { Request, Response, NextFunction } from "express";
import { logger } from "@core/logger/winston";

vi.mock("@core/logger/winston", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe("requestLogger middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      method: "POST",
      url: "/api/login",
      query: {},
      body: { email: "test@test.com", password: "secret123" },
      ip: "127.0.0.1",
      headers: { "user-agent": "test-agent" },
    };
    res = {
      statusCode: 200,
      on: vi.fn().mockImplementation(function (
        this: any,
        event: string,
        cb: () => void,
      ) {
        if (event === "finish") {
          this._finishCb = cb;
        }
        return this;
      }),
      end: vi.fn().mockImplementation(function (this: any) {
        if (this._finishCb) {
          this._finishCb();
        }
      }),
    } as any;
    next = vi.fn();
  });

  it("should log request and redact sensitive fields", () => {
    requestLogger(req as Request, res as Response, next);
    expect(logger.info).toHaveBeenCalledWith("Incoming POST /api/login", {
      requestId: "N/A",
      method: "POST",
      url: "/api/login",
      query: {},
      body: { email: "test@test.com", password: "***REDACTED***" },
      ip: "127.0.0.1",
      userAgent: "test-agent",
    });
    expect(next).toHaveBeenCalled();
  });

  it("should log response duration on end", () => {
    requestLogger(req as Request, res as Response, next);
    res.end?.();
    expect(logger.info).toHaveBeenCalledWith(
      "Response POST /api/login - 200",
      expect.objectContaining({
        status: 200,
        duration: expect.stringMatching(/\d+ms/),
      }),
    );
  });
});
