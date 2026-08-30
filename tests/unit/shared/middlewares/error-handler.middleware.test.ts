import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import {
  AppError,
  errorHandler,
  notFoundHandler,
} from "@shared/middlewares/error-handler.middleware";

vi.mock("@core/logger/winston", () => ({ logger: { error: vi.fn() } }));

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    path: "/test",
    method: "GET",
    ip: "127.0.0.1",
    ...overrides,
  } as Request;
}

describe("errorHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả 409 cho Prisma P2002 (unique constraint violation)", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "5.0.0",
    });
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Duplicate entry" }),
    );
  });

  it("trả 404 cho Prisma P2025 (record not found)", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("trả 400 cho các mã lỗi Prisma known khác (fallback chung)", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Other", {
      code: "P2003",
      clientVersion: "5.0.0",
    });
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Database error" }),
    );
  });

  it("trả 400 cho PrismaClientValidationError", () => {
    const err = new Prisma.PrismaClientValidationError("Invalid", {
      clientVersion: "5.0.0",
    });
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid data provided" }),
    );
  });

  it("trả 400 kèm chi tiết field cho ZodError", () => {
    let zodError: ZodError;
    try {
      z.object({ email: z.string().email() }).parse({ email: "not-an-email" });
      throw new Error("should have thrown");
    } catch (e) {
      zodError = e as ZodError;
    }
    const res = createMockResponse();

    errorHandler(zodError, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Validation failed",
        details: expect.arrayContaining([
          expect.objectContaining({ field: "email" }),
        ]),
      }),
    );
  });

  it("trả 401 cho JsonWebTokenError/TokenExpiredError", () => {
    const err = { name: "TokenExpiredError", message: "jwt expired" };
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid or expired token" }),
    );
  });

  it("dùng đúng statusCode và message thật của AppError operational (BadRequestError...)", () => {
    const err = new AppError("Custom message", 422, true);
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Custom message" }),
    );
  });

  it("ẨN message thật, trả 'Internal server error' cho lỗi không operational (tránh rò rỉ chi tiết nội bộ)", () => {
    const err = new AppError("Sensitive stack detail", 500, false);
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal server error" }),
    );
  });

  it("mặc định statusCode=500 cho lỗi thường (Error thuần, không phải AppError)", () => {
    const err = new Error("boom");
    const res = createMockResponse();

    errorHandler(err, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("dùng x-correlation-id từ header nếu có, thay vì tự sinh mới", () => {
    const err = new Error("boom");
    const res = createMockResponse();
    const req = createMockRequest({
      headers: { "x-correlation-id": "given-id-123" },
    });

    errorHandler(err, req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "given-id-123" }),
    );
  });
});

describe("notFoundHandler", () => {
  it("trả 404 kèm method và path trong message", () => {
    const res = createMockResponse();
    const req = createMockRequest({ method: "POST", path: "/api/unknown" });

    notFoundHandler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Route POST /api/unknown not found" }),
    );
  });
});
