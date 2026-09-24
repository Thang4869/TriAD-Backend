import rateLimit from "express-rate-limit";
import { RedisReply, RedisStore } from "rate-limit-redis";
import { Request } from "express";
import redis from "@core/redis/client";
import config from "@config";

export const rateLimiter = (options?: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  prefix?: string;
}) => {
  const {
    windowMs = config.RATE_LIMIT_WINDOW_MS,
    max = config.RATE_LIMIT_MAX,
    keyGenerator,
    prefix = "ratelimit:global:",
  } = options || {};

  return rateLimit({
    store: new RedisStore({
      prefix,
      sendCommand: (...args: string[]) =>
        redis.call(
          args[0],
          ...args.slice(1),
        ) as Promise<unknown> as Promise<RedisReply>,
    }),
    windowMs,
    max,
    keyGenerator:
      keyGenerator ||
      ((req) => {
        return req.ip || "unknown";
      }),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many requests, please try again later.",
    },
    skip: (req) => {
      return req.path === "/health";
    },
  });
};

export const strictRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  prefix: "ratelimit:strict:",
});

export const authRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  prefix: "ratelimit:auth:",
  keyGenerator: (req) =>
    `${req.ip || "unknown"}:${String(req.body?.email || "unknown").toLowerCase()}`,
});

export const totpRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  prefix: "ratelimit:totp:",
  keyGenerator: (req) =>
    `${req.ip || "unknown"}:${String(req.body?.preAuthToken || "missing")}`,
});
