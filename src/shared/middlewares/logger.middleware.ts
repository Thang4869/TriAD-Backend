import { Request, Response, NextFunction } from "express";
import { logger } from "@core/logger/winston";

const sensitiveFields = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "refreshToken",
];

const sanitizeBody = (body: any): any => {
  if (!body || typeof body !== "object") return body;
  const sanitized = { ...body };
  for (const field of sensitiveFields) {
    if (field in sanitized) sanitized[field] = "***REDACTED***";
  }
  return sanitized;
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();
  const { method, url, query, body, ip, headers } = req;
  const requestId = (req as any).requestId || "N/A";

  logger.info(`Incoming ${method} ${url}`, {
    requestId,
    method,
    url,
    query,
    body: sanitizeBody(body),
    ip,
    userAgent: headers["user-agent"],
  });

  const originalEnd = res.end;
  res.end = function (chunk: any, encoding?: any, callback?: any) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    logger.info(`Response ${method} ${url} - ${status}`, {
      requestId,
      status,
      duration: `${duration}ms`,
    });
    const _responseBody = chunk?.toString() || "";
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};
