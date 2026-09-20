import { describe, it, expect, vi } from "vitest";
import { validate } from "@shared/middlewares/validation.middleware";
import { z } from "zod";
import { Request, Response } from "express";
import { BadRequestError } from "@shared/utils/errors";

describe("validation middleware", () => {
  const schema = z.object({
    body: z.object({
      name: z.string().min(3),
    }),
    query: z.object({ page: z.string().optional() }),
    params: z.object({ id: z.string().uuid() }),
  });

  it("should pass validation and attach to req", () => {
    const req = {
      body: { name: "John" },
      query: { page: "1" },
      params: { id: "123e4567-e89b-12d3-a456-426614174000" },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "John" });
    expect(req.query).toEqual({ page: "1" });
    expect(req.params).toEqual({ id: "123e4567-e89b-12d3-a456-426614174000" });
  });

  it("giữ nguyên req.query/req.params gốc khi schema không khai báo các key đó (fallback || )", () => {
    // Schema chỉ validate "body", không khai báo "query"/"params" nên
    // schema.parse() trả về validated.query/validated.params = undefined,
    // buộc middleware phải fallback về req.query/req.params ban đầu.
    const bodyOnlySchema = z.object({
      body: z.object({ name: z.string().min(3) }),
    });
    const originalQuery = { page: "1", sort: "asc" };
    const originalParams = { id: "abc" };
    const req = {
      body: { name: "John" },
      query: originalQuery,
      params: originalParams,
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    validate(bodyOnlySchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "John" });
    expect(req.query).toBe(originalQuery);
    expect(req.params).toBe(originalParams);
  });

  it("giữ nguyên req.body gốc khi schema không khai báo key 'body' (fallback || cho body)", () => {
    // Schema chỉ validate "query", không khai báo "body" nên
    // schema.parse() trả về validated.body = undefined, buộc middleware
    // phải fallback về req.body ban đầu (nhánh còn lại của validated.body || req.body).
    const queryOnlySchema = z.object({
      query: z.object({ page: z.string().optional() }),
    });
    const originalBody = { name: "unchanged" };
    const req = {
      body: originalBody,
      query: { page: "2" },
      params: {},
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    validate(queryOnlySchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toBe(originalBody);
    expect(req.query).toEqual({ page: "2" });
  });

  it("should throw BadRequestError on validation failure", () => {
    const req = {
      body: { name: "Jo" },
      query: {},
      params: { id: "invalid" },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    const error = next.mock.calls[0][0] as BadRequestError;
    expect(error.message).toContain(
      "String must contain at least 3 character(s)",
    );
  });

  it("should forward non-ZodError errors to next as-is", () => {
    const unexpectedError = new Error("schema parse blew up unexpectedly");
    const brokenSchema = {
      parse: vi.fn(() => {
        throw unexpectedError;
      }),
    } as unknown as z.ZodSchema;

    const req = {
      body: {},
      query: {},
      params: {},
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    validate(brokenSchema)(req, res, next);
    expect(next).toHaveBeenCalledWith(unexpectedError);
  });
});
