import rateLimit from "express-rate-limit";
import { RedisReply, RedisStore } from "rate-limit-redis";
import { Request } from "express";
import redis from "@core/redis/client";

export const rateLimiter = (options?: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
}) => {
  const {
    windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    max = parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
    keyGenerator,
  } = options || {};

  return rateLimit({
    store: new RedisStore({
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
        const ip = req.ip || req.headers["x-forwarded-for"];
        if (Array.isArray(ip)) return ip[0] || "unknown";
        return ip || "unknown";
      }),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many requests, please try again later.",
    },
    skip: (req) => {
      return (
        req.path === "/health" ||
        (req.user as { role?: string })?.role === "ADMIN"
      );
    },
  });
};

export const strictRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

export const authRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
});
