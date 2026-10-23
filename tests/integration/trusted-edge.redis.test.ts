import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createTrustedEdgeMiddleware } from "@shared/middlewares/trusted-edge.middleware";
import { rateLimiter } from "@shared/middlewares/rate-limit.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

it("separates authenticated edge client budgets with real Redis and rejects direct header spoofing", async () => {
  const secret = "disposable-real-redis-edge-secret-long-enough";
  const app = express();
  app.set("trust proxy", 0);
  app.use("/api", createTrustedEdgeMiddleware(secret));
  app.use(
    "/api",
    rateLimiter({
      max: 2,
      windowMs: 5000,
      prefix: "edge-fixture-" + randomUUID() + ":",
    }),
  );
  app.get("/api/example", (_req, res) => res.json({ success: true }));
  app.use(createErrorHandler({ classify: () => null }));
  const hit = (ip: string) =>
    request(app)
      .get("/api/example")
      .set("X-Triad-Edge-Key", secret)
      .set("X-Triad-Client-Ip", ip)
      .set("X-Forwarded-For", randomUUID());
  expect(
    (
      await request(app)
        .get("/api/example")
        .set("X-Triad-Client-Ip", "203.0.113.1")
    ).status,
  ).toBe(403);
  expect((await hit("203.0.113.1")).status).toBe(200);
  expect((await hit("203.0.113.1")).status).toBe(200);
  expect((await hit("203.0.113.1")).status).toBe(429);
  expect((await hit("203.0.113.2")).status).toBe(200);
});
