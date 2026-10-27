import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import redis from "@core/redis/client";
import { parseTrustProxy } from "@config/trust-proxy";
import { rateLimiter } from "@shared/middlewares/rate-limit.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

function proxyApp(trustedProxies: string) {
  const app = express();
  app.set("trust proxy", parseTrustProxy(trustedProxies));
  app.get("/health/live", (_req, res) => res.json({ status: "up" }));
  app.use(
    "/api",
    rateLimiter({
      windowMs: 60_000,
      max: 2,
      prefix: `ratelimit:proxy-integration:${randomUUID()}:`,
    }),
  );
  app.get("/api/example", (req, res) => res.json({ ip: req.ip }));
  app.use(createErrorHandler({ classify: () => null }));
  return app;
}

describe("B7 real Redis rate-limit keying behind a reverse proxy", () => {
  beforeEach(async () => {
    await redis.ping();
  });

  it("ignores hostile X-Forwarded-For when TRUST_PROXY=0", async () => {
    const app = proxyApp("0");
    const first = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.10");
    const second = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.99");
    const limited = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "198.51.100.99");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.ip).toBe(second.body.ip);
    expect(first.body.ip).not.toBe("203.0.113.10");
    expect(limited.status).toBe(429);
    expect(limited.headers["ratelimit-limit"]).toBe("2");
  });

  it("rejects forwarded spoofing from a peer outside the proxy allowlist", async () => {
    const app = proxyApp("192.0.2.0/24");
    const first = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.10");
    const second = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.11");
    const limited = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "198.51.100.11");

    expect([first.status, second.status, limited.status]).toEqual([
      200, 200, 429,
    ]);
    expect(first.body.ip).toBe(second.body.ip);
    expect(first.body.ip).not.toBe("203.0.113.10");
  });

  it("uses the nearest untrusted hop and separates clients behind a trusted proxy", async () => {
    // Simulates an intentionally trusted immediate reverse proxy in a
    // controlled test. Never enable TRUST_PROXY=1 on a directly exposed API.
    const app = proxyApp("1");
    const one = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.77, 198.51.100.20");
    const spoof = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.88, 198.51.100.20");
    const limited = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.89, 198.51.100.20");
    const otherClient = await request(app)
      .get("/api/example")
      .set("X-Forwarded-For", "203.0.113.77, 198.51.100.21");

    expect([
      one.status,
      spoof.status,
      limited.status,
      otherClient.status,
    ]).toEqual([200, 200, 429, 200]);
    expect(one.body.ip).toBe("198.51.100.20");
    expect(spoof.body.ip).toBe("198.51.100.20");
    expect(otherClient.body.ip).toBe("198.51.100.21");
  });

  it("leaves liveness outside the Redis API rate limiter", async () => {
    const app = proxyApp("0");
    for (let i = 0; i < 3; i += 1) {
      const response = await request(app).get("/api/example");
      expect(response.status).toBe(i === 2 ? 429 : 200);
    }
    const live = await request(app).get("/health/live");
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: "up" });
  });
});
