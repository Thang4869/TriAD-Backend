import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ stall: "" }));
vi.mock("@core/redis/client", () => ({
  default: {
    get: vi.fn(() =>
      state.stall === "get" ? new Promise(() => {}) : Promise.resolve(null),
    ),
    set: vi.fn(() =>
      state.stall === "set" ? new Promise(() => {}) : Promise.resolve("OK"),
    ),
    eval: vi.fn().mockResolvedValue(1),
  },
}));
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

describe("idempotency HTTP store deadline", () => {
  beforeEach(() => {
    state.stall = "";
  });
  it.each(["get", "set"])(
    "fails closed on indefinitely stalled %s and recovers without running the rejected mutation",
    async (operation) => {
      const app = express();
      const mutation = vi.fn();
      app.use(express.json());
      app.post("/api/checkout", idempotencyMiddleware(), (_req, res) => {
        mutation();
        res.status(201).json({ success: true });
      });
      app.use(createErrorHandler({ classify: () => null }));
      state.stall = operation;
      const start = Date.now();
      const failed = await request(app)
        .post("/api/checkout")
        .set("Idempotency-Key", "fixture-key")
        .send({});
      expect(failed.status).toBe(503);
      expect(Date.now() - start).toBeLessThan(3000);
      expect(mutation).not.toHaveBeenCalled();
      state.stall = "";
      expect(
        (
          await request(app)
            .post("/api/checkout")
            .set("Idempotency-Key", "recovered-fixture-key")
            .send({})
        ).status,
      ).toBe(201);
      expect(mutation).toHaveBeenCalledTimes(1);
    },
  );
});
