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
});
