import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import redis from "@core/redis/client";
import config from "@config";
import {
  BadRequestError,
  ConflictError,
  UnprocessableEntityError,
} from "@shared/utils/errors";

export const idempotencyMiddleware = (
  keyHeader: string = "Idempotency-Key",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH"].includes(req.method)) {
      return next();
    }

    const headerValue = req.headers[keyHeader.toLowerCase()];
    const idempotencyKey = typeof headerValue === "string" ? headerValue : "";
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(idempotencyKey)) {
      return next(new BadRequestError("Idempotency-Key header required"));
    }

    const userId = (req.user as { id?: string } | undefined)?.id || "anonymous";
    const route =
      req.baseUrl || (req.originalUrl || req.url || "unknown").split("?")[0];
    const cacheKey = `idempotency:${userId}:${route}:${idempotencyKey}`;
    const body = { ...((req.body || {}) as Record<string, unknown>) };
    delete body.idempotencyKey;
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const ttl = config.IDEMPOTENCY_TTL;

    const cached = await redis.get(cacheKey);
    if (cached) return replayOrReject(cached, requestHash, res, next);

    const claimed = await redis.set(
      cacheKey,
      JSON.stringify({ state: "IN_PROGRESS", requestHash }),
      "EX",
      ttl,
      "NX",
    );
    if (claimed !== "OK") {
      const concurrent = await redis.get(cacheKey);
      if (concurrent) return replayOrReject(concurrent, requestHash, res, next);
      return next(new ConflictError("Request is already in progress"));
    }

    req.body.idempotencyKey = idempotencyKey;
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis
          .setex(
            cacheKey,
            ttl,
            JSON.stringify({
              state: "COMPLETED",
              requestHash,
              status: res.statusCode,
              data: body,
            }),
          )
          .catch(() => {});
      } else {
        redis.del(cacheKey).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
};

function replayOrReject(
  cached: string,
  requestHash: string,
  res: Response,
  next: NextFunction,
): void {
  try {
    const cachedResponse = JSON.parse(cached) as {
      state: "IN_PROGRESS" | "COMPLETED";
      requestHash: string;
      status?: number;
      data?: unknown;
    };
    if (cachedResponse.requestHash !== requestHash) {
      return next(
        new UnprocessableEntityError(
          "Idempotency key was reused with a different request",
        ),
      );
    }
    if (cachedResponse.state === "IN_PROGRESS") {
      return next(new ConflictError("Request is already in progress"));
    }
    if (cachedResponse.status === undefined) {
      return next(new ConflictError("Invalid idempotency state"));
    }
    res.status(cachedResponse.status).json(cachedResponse.data);
  } catch {
    next(new ConflictError("Invalid idempotency state"));
  }
}
