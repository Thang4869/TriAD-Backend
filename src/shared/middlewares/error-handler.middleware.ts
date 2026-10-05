import { Request, Response, NextFunction } from "express";
import { logger } from "@core/logger/winston";
import type { PersistenceErrorClassifier } from "@shared/errors/persistence-error";
import { ZodError } from "zod";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { DomainError } from "@shared/domain/errors/domain-error";
import { ApplicationError } from "@shared/errors/application-error";

const DOMAIN_ERROR_STATUS_MAP: Readonly<Record<string, number>> = {
  "ORDER.NOT_MUTABLE": 409,
  "ORDER.INVALID_ITEM": 400,
  "ORDER.INVALID_DISCOUNT": 400,
  "ORDER.EMPTY": 400,
  "ORDER.ALREADY_PLACED": 409,
  "ORDER.INVALID_TRANSITION": 409,
  "ORDER.NOT_CANCELLABLE": 409,
  "CART.INVALID_QUANTITY": 400,
  "CART.ITEM_NOT_FOUND": 404,
  "PRODUCT.INVALID_PRICE": 400,
  "PRODUCT.INSUFFICIENT_STOCK": 409,
  "PRODUCT.INVALID_STOCK_QUANTITY": 400,
  "PRODUCT.ALREADY_ACTIVE": 409,
  "PRODUCT.ALREADY_INACTIVE": 409,
  "USER.ALREADY_VERIFIED": 409,
  "USER.2FA_ALREADY_ENABLED": 409,
  "USER.2FA_NOT_SET_UP": 409,
  "USER.2FA_NOT_ENABLED": 409,
  "USER.INVALID_STATE": 400,
  "USER.WEAK_PASSWORD": 400,
};

const APPLICATION_ERROR_STATUS_MAP: Readonly<Record<string, number>> = {
  "APPLICATION.VALIDATION": 400,
  "APPLICATION.AUTHENTICATION": 401,
  "APPLICATION.AUTHORIZATION": 403,
  "APPLICATION.NOT_FOUND": 404,
  "APPLICATION.CONFLICT": 409,
  "APPLICATION.UNPROCESSABLE": 422,
  "APPLICATION.RATE_LIMIT": 429,
};

interface ErrorResponsePayload {
  success: false;
  error: string;
  code?: string;
  correlationId: string | string[];
  details?: unknown;
  stack?: string;
}

export function createErrorHandler(
  persistenceErrors: PersistenceErrorClassifier,
) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const correlationHeader =
      req.headers["x-request-id"] || req.headers["x-correlation-id"];
    const correlationId = sanitizeCorrelationId(correlationHeader);

    let statusCode = 500;
    let message = "Internal server error";
    let details: unknown = undefined;
    let code: string | undefined;

    if (
      err !== null &&
      typeof err === "object" &&
      "type" in err &&
      err.type === "entity.too.large"
    ) {
      statusCode = 413;
      message = "Request payload too large";
    } else if (err instanceof DomainError) {
      statusCode = DOMAIN_ERROR_STATUS_MAP[err.code] ?? 400;
      message = err.message;
      code = err.code;
      details = err.context;
    } else if (err instanceof ApplicationError) {
      statusCode = APPLICATION_ERROR_STATUS_MAP[err.code] ?? 500;
      message = err.message;
      code = err.code;
      details = err.context;
    } else if (err instanceof ZodError) {
      statusCode = 400;
      message = "Validation failed";
      details = err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
    } else if (
      err instanceof JsonWebTokenError ||
      err instanceof TokenExpiredError ||
      (err &&
        typeof err === "object" &&
        "name" in err &&
        (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError"))
    ) {
      statusCode = 401;
      message = "Invalid or expired token";
    } else {
      const persistenceError = persistenceErrors.classify(err);

      if (persistenceError) {
        switch (persistenceError.kind) {
          case "UNIQUE_CONSTRAINT":
            statusCode = 409;
            message = "Duplicate entry";
            break;

          case "NOT_FOUND":
            statusCode = 404;
            message = "Record not found";
            break;

          case "TRANSACTION_CONFLICT":
            statusCode = 409;
            code = "RETRYABLE_CONFLICT";
            message = "Transaction conflict, please retry";
            break;

          case "VALIDATION":
            statusCode = 400;
            message = "Invalid data provided";
            break;

          case "DATABASE":
            statusCode = 400;
            message = "Database error";
            break;
        }
      } else if (err instanceof Error) {
        message = "Internal server error";
      }
    }

    const logPayload = {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      statusCode,
      code,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: (req.user as { id: string })?.id,
      correlationId,
    };

    if (statusCode >= 500) {
      logger.error("Error:", logPayload);
    } else {
      logger.warn("Error:", logPayload);
    }

    const responsePayload: ErrorResponsePayload = {
      success: false,
      error: message,
      correlationId,
    };

    if (code) {
      responsePayload.code = code;
    }

    if (details) {
      responsePayload.details = details;
    }

    if (process.env.NODE_ENV === "development" && err instanceof Error) {
      responsePayload.stack = err.stack;
    }

    res.status(statusCode).json(responsePayload);
  };
}

function sanitizeCorrelationId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }

  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
};
