import { createHmac } from "node:crypto";
import rateLimit from "express-rate-limit";
import { RedisReply, RedisStore } from "rate-limit-redis";
import { Request } from "express";
import redis from "@core/redis/client";
import config from "@config";
import { DependencyUnavailableError } from "@shared/errors/application-error";
import {
  rateLimitDecisionsTotal,
  rateLimitStoreFailuresTotal,
} from "@core/metrics/metrics.registry";

// The main Redis client supports long-lived queue consumers. HTTP rate-limit
// lookups must instead fail promptly and closed when Redis is unavailable.
const RATE_LIMIT_STORE_TIMEOUT_MS = 1000;

// Metrics use finite, code-defined labels; never expose IP/email/token/Redis keys.
function bucketLabel(prefix: string): string {
  const names: Readonly<Record<string, string>> = {
    "ratelimit:global:": "global",
    "ratelimit:strict:": "strict",
    "ratelimit:auth-ip:": "auth_ip",
    "ratelimit:auth:": "auth_identity",
    "ratelimit:totp-ip:": "totp_ip",
    "ratelimit:totp:": "totp_identity",
    "ratelimit:refresh-ip:": "refresh_ip",
  };
  return names[prefix] ?? "custom";
}

function storeFailure(
  operation: "bootstrap" | "request",
  reason: "not_ready" | "timeout" | "error",
): DependencyUnavailableError {
  rateLimitStoreFailuresTotal.inc({ operation, reason });
  return new DependencyUnavailableError(
    reason === "timeout" ? "Rate limit store timed out" : "Rate limit store unavailable",
  );
}

function sendRateLimitCommand(...args: string[]): Promise<RedisReply> {
  // rate-limit-redis initiates SCRIPT LOAD during store construction, often
  // while ioredis is still connecting. Allow that one command to queue, but
  // NEVER let a stalled Redis or offline queue hang HTTP/bootstrap forever.
  const isScriptLoad = args[0] === "SCRIPT" && args[1] === "LOAD";
  const operation = isScriptLoad ? "bootstrap" : "request";
  if (!isScriptLoad && redis.status !== "ready") {
    return Promise.reject(storeFailure(operation, "not_ready"));
  }

  return new Promise<RedisReply>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(storeFailure(operation, "timeout"));
    }, RATE_LIMIT_STORE_TIMEOUT_MS);

    try {
      Promise.resolve(redis.call(args[0], ...args.slice(1))).then(
        (reply) => {
          clearTimeout(timeout);
          resolve(reply as RedisReply);
        },
        () => {
          clearTimeout(timeout);
          // Do not propagate Redis connection details or raw key material.
          reject(storeFailure(operation, "error"));
        },
      );
    } catch {
      clearTimeout(timeout);
      reject(storeFailure(operation, "error"));
    }
  });
}

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
      sendCommand: sendRateLimitCommand,
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
    // Redis outage must not silently disable abuse protection.
    passOnStoreError: false,
    handler: (_req, res, _next, options) => {
      rateLimitDecisionsTotal.inc({
        bucket: bucketLabel(prefix),
        outcome: "deny",
      });
      res.status(options.statusCode).json(options.message);
    },
    message: {
      success: false,
      error: "Too many requests, please try again later.",
    },
  });
};

export const strictRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  prefix: "ratelimit:strict:",
});

// Domain-separated HMAC prevents email addresses and pre-auth secrets from
// appearing as plaintext Redis keys. Use a stable configured secret across replicas.
function identityDigest(purpose: string, value: string): string {
  return createHmac("sha256", config.JWT_ACCESS_SECRET)
    .update(`triad:rate-limit:v1:${purpose}:${value}`)
    .digest("hex");
}

const requestIp = (req: Request): string => req.ip || "unknown";

const emailBucket = (req: Request): string => {
  const raw = req.body?.email;
  if (typeof raw !== "string") return "missing";
  const normalized = raw.trim().toLowerCase();
  return normalized ? identityDigest("email", normalized) : "missing";
};

const preAuthBucket = (req: Request): string => {
  const raw = req.body?.preAuthToken;
  return typeof raw === "string" && raw.length > 0
    ? identityDigest("preauth", raw)
    : "missing";
};

// Prevent account enumeration / rotating email addresses from bypassing
// the per-identity threshold; budget is per trusted Express client IP.
export const authIpRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  prefix: "ratelimit:auth-ip:",
});

export const authRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  prefix: "ratelimit:auth:",
  keyGenerator: (req) => `${requestIp(req)}:${emailBucket(req)}`,
});

export const totpIpRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  prefix: "ratelimit:totp-ip:",
});

export const totpRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  prefix: "ratelimit:totp:",
  keyGenerator: (req) => `${requestIp(req)}:${preAuthBucket(req)}`,
});

// Token refresh should not have only the global per-minute request budget.
export const refreshRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: "ratelimit:refresh-ip:",
});
