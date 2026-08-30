import { describe, it, expect } from "vitest";
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from "@shared/utils/errors";
import { AppError } from "@shared/middlewares/error-handler.middleware";

describe("Custom error classes", () => {
  it.each([
    [new BadRequestError("bad"), 400, "bad"],
    [new UnauthorizedError(), 401, "Unauthorized"],
    [new UnauthorizedError("custom"), 401, "custom"],
    [new ForbiddenError(), 403, "Forbidden"],
    [new NotFoundError(), 404, "Not found"],
    [new ConflictError(), 409, "Conflict"],
    [new RateLimitError(), 429, "Too many requests"],
  ])(
    "%# gán đúng statusCode và message mặc định",
    (err, expectedStatus, expectedMessage) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(expectedStatus);
      expect(err.message).toBe(expectedMessage);
    },
  );
});
