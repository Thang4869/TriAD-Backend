import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "@shared/utils/async-handler";
import { Request, Response } from "express";

describe("asyncHandler", () => {
  it("should call handler and catch errors", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    const handler = vi.fn().mockRejectedValue(new Error("test error"));
    const wrapped = asyncHandler(handler);

    await wrapped(req, res, next);
    expect(next).toHaveBeenCalledWith(new Error("test error"));
  });

  it("should call handler and not call next if successful", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(handler);

    await wrapped(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
