import { Request, Response, NextFunction } from "express";
import { logger } from "@core/logger/winston";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

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
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.isOperational ? err.message : "Internal server error";
    isOperational = err.isOperational;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // ... xử lý Prisma
  } else if (err instanceof ZodError) {
    // ...
  } else if (err instanceof Error) {
    // lỗi thường
    message = err.message;
  }

  // log
  logger.error("Error:", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    correlationId,
  });

  // response
  res.status(statusCode).json({
    success: false,
    error: message,
    correlationId,
    ...(process.env.NODE_ENV === "development" && {
      stack: err instanceof Error ? err.stack : undefined,
    }),
  });
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
