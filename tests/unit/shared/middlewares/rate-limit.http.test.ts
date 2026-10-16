import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hits: 0, unavailable: false }));

vi.mock("@core/redis/client", () => ({
  default: { status: "ready", call: vi.fn() },
}));

// Keep express-rate-limit real and replace only the external Redis adapter.
// This verifies HTTP middleware behavior, not Redis connectivity.
vi.mock("rate-limit-redis", async () => {
  const { DependencyUnavailableError } = await import("@shared/errors/application-error");
  return { RedisStore: class {
    async increment() {
      if (state.unavailable) throw new DependencyUnavailableError("Rate limit store unavailable");
      state.hits += 1;
      return { totalHits: state.hits, resetTime: new Date(Date.now() + 60_000) };
    }
    async decrement() {
      state.hits = Math.max(0, state.hits - 1);
    }
    async resetKey() {
      state.hits = 0;
    }
  } };
});

import { rateLimiter } from "@shared/middlewares/rate-limit.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

function makeApp() {
  const app = express();
  app.use("/api", rateLimiter({ windowMs: 60_000, max: 2 }));
  app.get("/api/example", (_req, res) => res.json({ success: true }));
  app.use(createErrorHandler({ classify: () => null }));
  return app;
}

describe("B7 HTTP rate limiting contract", () => {
  beforeEach(() => {
    state.hits = 0;
    state.unavailable = false;
  });

  it("returns 429 after the configured request budget", async () => {
    const app = makeApp();
    expect((await request(app).get("/api/example")).status).toBe(200);
    expect((await request(app).get("/api/example")).status).toBe(200);
    const response = await request(app).get("/api/example");
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ success: false });
  });

  it("fails closed with 503 during store outage and resumes after recovery", async () => {
    const app = makeApp();
    state.unavailable = true;
    const failed = await request(app).get("/api/example");
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ success: false });
    state.unavailable = false;
    const recovered = await request(app).get("/api/example");
    expect(recovered.status).toBe(200);
  });
});
