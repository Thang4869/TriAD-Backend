import { Request, Response, NextFunction } from "express";
import redis from "@core/redis/client";
import { BadRequestError } from "@shared/utils/errors";

export const idempotencyMiddleware = (
  keyHeader: string = "Idempotency-Key",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH"].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers[keyHeader.toLowerCase()] as string;
    if (!idempotencyKey) {
      return next(new BadRequestError("Idempotency-Key header required"));
    }

    req.body.idempotencyKey = idempotencyKey;

    const cached = await redis.get(`idempotent:${idempotencyKey}`);
    if (cached) {
      try {
        const cachedResponse = JSON.parse(cached);
        return res.status(cachedResponse.status).json(cachedResponse.data);
      } catch {
        // Ignore JSON parse errors
      }
    }

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheData = {
          status: res.statusCode,
          data: body,
        };
        const ttl = parseInt(process.env.IDEMPOTENCY_TTL || "86400", 10);
        redis
          .setex(`idempotent:${idempotencyKey}`, ttl, JSON.stringify(cacheData))
          .catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
};
