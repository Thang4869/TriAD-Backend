import { Request, Response, NextFunction } from "express";
import { logger } from "@core/logger/winston";

const sensitiveFields = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "refreshToken",
];

const sanitizeBody = (body: unknown): unknown => {
  if (!body || typeof body !== "object") return body;
  const sanitized: Record<string, unknown> = {
    ...(body as Record<string, unknown>),
  };
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "***REDACTED***";
    }
  }
  return sanitized;
};

type AppRequest = Request & { requestId?: string };

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();
  const { method, url, query, body, ip, headers } = req;
  const requestId = (req as AppRequest).requestId || "N/A";

  logger.info(`Incoming ${method} ${url}`, {
    requestId,
    method,
    url,
    query,
    body: sanitizeBody(body),
    ip,
    userAgent: headers["user-agent"],
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`Response ${method} ${url} - ${res.statusCode}`, {
      requestId,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
};
