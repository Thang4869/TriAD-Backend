import { Request, Response, NextFunction } from "express";
import { logger } from "@core/logger/winston";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import {
  DomainError,
  DOMAIN_ERROR_STATUS_MAP,
} from "@shared/domain/errors/domain-error";

interface ErrorResponsePayload {
  success: false;
  error: string;
  code?: string;
  correlationId: string | string[];
  details?: unknown;
  stack?: string;
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const correlationId =
    req.headers["x-correlation-id"] ||
    `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  let statusCode = 500;
  let message = "Internal server error";
  let details: unknown = undefined;
  let code: string | undefined;

  if (err instanceof DomainError) {
    statusCode = DOMAIN_ERROR_STATUS_MAP[err.code] ?? 400;
    message = err.message;
    code = err.code;
    details = err.context;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.isOperational ? err.message : "Internal server error";
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "Duplicate entry";
        break;
      case "P2025":
        statusCode = 404;
        message = "Record not found";
        break;
      default:
        statusCode = 400;
        message = "Database error";
        break;
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid data provided";
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
  } else if (err instanceof Error) {
    message = err.message;
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

  // response
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
