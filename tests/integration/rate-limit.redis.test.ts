import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import redis from "@core/redis/client";
import { rateLimiter } from "@shared/middlewares/rate-limit.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

function makeApp(prefix: string) {
  const app = express();
  app.use(
    "/api",
    rateLimiter({ windowMs: 60_000, max: 2, prefix }),
  );
  app.get("/api/example", (_req, res) => res.json({ success: true }));
  app.use(createErrorHandler({ classify: () => null }));
  return app;
}

describe("B7 rate limiting with real Redis", () => {
  beforeEach(async () => {
    await redis.ping();
  });

  it("returns 429 after the configured request budget", async () => {
    const app = makeApp(`ratelimit:integration:${Date.now()}:`);
    expect((await request(app).get("/api/example")).status).toBe(200);
    expect((await request(app).get("/api/example")).status).toBe(200);

    const limited = await request(app).get("/api/example");
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false });
    expect(limited.headers["ratelimit-limit"]).toBe("2");
  });

  it("fails closed while the Redis client is disconnected and recovers after reconnect", async () => {
    const app = makeApp(`ratelimit:recovery:${Date.now()}:`);

    redis.disconnect();
    try {
      const unavailable = await request(app).get("/api/example");
      expect(unavailable.status).toBe(503);
      expect(unavailable.body).toMatchObject({
        success: false,
        code: "APPLICATION.DEPENDENCY_UNAVAILABLE",
      });
    } finally {
      if (redis.status === "end") {
        await redis.connect();
      }
    }

    await redis.ping();
    const recovered = await request(app).get("/api/example");
    expect(recovered.status).toBe(200);
  });
});
