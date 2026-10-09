import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createHealthRoutes } from "@core/health/health.routes";

describe("Health routes", () => {
  it("returns 200 for liveness", async () => {
    const getReadiness = vi.fn();

    const app = express();
    app.use("/health", createHealthRoutes({ getReadiness }));

    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("up");
    expect(getReadiness).not.toHaveBeenCalled();
  });

  it("returns 200 when dependencies are ready", async () => {
    const report = {
      status: "up" as const,
      timestamp: new Date().toISOString(),
      components: {},
    };

    const getReadiness = vi.fn().mockResolvedValue(report);

    const app = express();
    app.use("/health", createHealthRoutes({ getReadiness }));

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(report);
    expect(getReadiness).toHaveBeenCalledOnce();
  });

  it("returns 503 when dependencies are unavailable", async () => {
    const report = {
      status: "down" as const,
      timestamp: new Date().toISOString(),
      components: {},
    };

    const getReadiness = vi.fn().mockResolvedValue(report);

    const app = express();
    app.use("/health", createHealthRoutes({ getReadiness }));

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual(report);
  });
});
