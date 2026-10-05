import { describe, it, expect } from "vitest";
import {
  ApplicationError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ResourceNotFoundError,
  ConflictError,
  UnprocessableError,
  RateLimitError,
} from "@shared/errors/application-error";

describe("application errors", () => {
  it.each([
    [new ValidationError("bad"), "APPLICATION.VALIDATION"],
    [new AuthenticationError(), "APPLICATION.AUTHENTICATION"],
    [new AuthorizationError(), "APPLICATION.AUTHORIZATION"],
    [new ResourceNotFoundError(), "APPLICATION.NOT_FOUND"],
    [new ConflictError(), "APPLICATION.CONFLICT"],
    [new UnprocessableError(), "APPLICATION.UNPROCESSABLE"],
    [new RateLimitError(), "APPLICATION.RATE_LIMIT"],
  ])("exposes semantic code without HTTP concerns", (err, expectedCode) => {
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApplicationError);
    expect(err.code).toBe(expectedCode);
    expect(err.name).toBe(err.constructor.name);
    expect(err.stack).toBeDefined();
    expect("statusCode" in err).toBe(false);
  });

  it("supports optional context", () => {
    const err = new ValidationError("Invalid input", {
      field: "email",
    });

    expect(err.context).toEqual({
      field: "email",
    });
  });
});
