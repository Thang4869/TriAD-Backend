export abstract class ApplicationError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends ApplicationError {
  readonly code = "APPLICATION.VALIDATION";

  constructor(
    message: string = "Invalid request",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

export class AuthenticationError extends ApplicationError {
  readonly code = "APPLICATION.AUTHENTICATION";

  constructor(
    message: string = "Authentication required",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

export class AuthorizationError extends ApplicationError {
  readonly code = "APPLICATION.AUTHORIZATION";

  constructor(
    message: string = "Insufficient permissions",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

export class ResourceNotFoundError extends ApplicationError {
  readonly code = "APPLICATION.NOT_FOUND";

  constructor(
    message: string = "Resource not found",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

export class ConflictError extends ApplicationError {
  readonly code = "APPLICATION.CONFLICT";

  constructor(
    message: string = "Resource conflict",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

export class UnprocessableError extends ApplicationError {
  readonly code = "APPLICATION.UNPROCESSABLE";

  constructor(
    message: string = "Request cannot be processed",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

export class RateLimitError extends ApplicationError {
  readonly code = "APPLICATION.RATE_LIMIT";

  constructor(
    message: string = "Too many requests",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}
