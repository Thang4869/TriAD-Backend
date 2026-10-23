import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import redis from "@core/redis/client";
import config from "@config";
import {
  ValidationError,
  ConflictError,
  UnprocessableError,
  DependencyUnavailableError,
} from "@shared/errors/application-error";
import { logger } from "@core/logger/winston";

// ioredis queues commands while reconnecting; HTTP must not wait indefinitely.
async function boundedRedis<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Idempotency store timeout")),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Compare the exact claimed value atomically: a stale handler must never
// overwrite or delete the replacement owner's claim after lease expiry.
const COMPLETE_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
end
return 0
`;
const RENEW_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
`;
const DELETE_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export const idempotencyMiddleware = (
  keyHeader: string = "Idempotency-Key",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!["POST", "PUT", "PATCH"].includes(req.method)) {
        return next();
      }

      const headerValue = req.headers[keyHeader.toLowerCase()];
      const idempotencyKey = typeof headerValue === "string" ? headerValue : "";

      if (!/^[A-Za-z0-9._~-]{1,128}$/.test(idempotencyKey)) {
        return next(new ValidationError("Idempotency-Key header required"));
      }

      const userId =
        (req.user as { id?: string } | undefined)?.id || "anonymous";

      const route =
        req.baseUrl || (req.originalUrl || req.url || "unknown").split("?")[0];

      const cacheKey = `idempotency:${userId}:${route}:${idempotencyKey}`;
      const keyFingerprint = crypto
        .createHash("sha256")
        .update(cacheKey)
        .digest("hex")
        .slice(0, 16);

      const body = { ...((req.body || {}) as Record<string, unknown>) };
      delete body.idempotencyKey;

      const requestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex");

      const completedTtl = config.IDEMPOTENCY_TTL;
      const inProgressTtl = Math.min(completedTtl, 60);

      const cached = await boundedRedis(() => redis.get(cacheKey));

      if (cached) {
        return replayOrReject(cached, requestHash, res, next);
      }

      const claimValue = JSON.stringify({
        state: "IN_PROGRESS",
        requestHash,
        ownerId: crypto.randomUUID(),
      });
      const claimed = await boundedRedis(() =>
        redis.set(cacheKey, claimValue, "EX", inProgressTtl, "NX"),
      );

      if (claimed !== "OK") {
        const concurrent = await boundedRedis(() => redis.get(cacheKey));

        if (concurrent) {
          return replayOrReject(concurrent, requestHash, res, next);
        }

        return next(new ConflictError("Request is already in progress"));
      }

      const leaseTimer = setInterval(
        () => {
          void redis
            .eval(
              RENEW_IF_OWNER,
              1,
              cacheKey,
              claimValue,
              String(inProgressTtl),
            )
            .then((renewed) => {
              if (renewed !== 1) clearInterval(leaseTimer);
            })
            .catch((error) => {
              clearInterval(leaseTimer);
              logger.error("Idempotency lease renewal failed", {
                error,
                keyFingerprint,
              });
            });
        },
        Math.max(1000, Math.floor((inProgressTtl * 1000) / 3)),
      );
      leaseTimer.unref();
      res.once?.("close", () => clearInterval(leaseTimer));
      res.once?.("finish", () => clearInterval(leaseTimer));
      req.body.idempotencyKey = idempotencyKey;

      const originalJson = res.json.bind(res);

      res.json = function (body: unknown) {
        clearInterval(leaseTimer);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis
            .eval(
              COMPLETE_IF_OWNER,
              1,
              cacheKey,
              claimValue,
              JSON.stringify({
                state: "COMPLETED",
                requestHash,
                status: res.statusCode,
                data: body,
              }),
              String(completedTtl),
            )
            .catch((error) => {
              logger.error("Failed to persist completed idempotency response", {
                error,
                keyFingerprint,
              });
            });
        } else {
          redis
            .eval(DELETE_IF_OWNER, 1, cacheKey, claimValue)
            .catch((error) => {
              logger.error("Failed to clear idempotency claim", {
                error,
                keyFingerprint,
              });
            });
        }

        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error("Idempotency Redis state unavailable", { error });
      next(
        new DependencyUnavailableError("Idempotency temporarily unavailable"),
      );
    }
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
        new UnprocessableError(
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
