import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const metrics = vi.hoisted(() => ({
  contentType: "text/plain; version=0.0.4; charset=utf-8",
  metrics: vi.fn(),
}));

vi.mock("@core/metrics/metrics.registry", () => ({
  metricsRegistry: metrics,
}));

import { metricsRoutes } from "@core/metrics/metrics.routes";

describe("metricsRoutes", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns Prometheus metrics with the registry content type", async () => {
    metrics.metrics.mockResolvedValue("# HELP requests_total Total requests\nrequests_total 2\n");
    const app = express().use("/metrics", metricsRoutes);

    const response = await request(app).get("/metrics/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("requests_total 2");
    expect(metrics.metrics).toHaveBeenCalledOnce();
  });

  it("propagates registry collection failures to Express error handling", async () => {
    metrics.metrics.mockRejectedValue(new Error("registry unavailable"));
    const app = express()
      .use("/metrics", metricsRoutes)
      .use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(503).send(error.message);
      });

    const response = await request(app).get("/metrics/");

    expect(response.status).toBe(503);
    expect(response.text).toBe("registry unavailable");
  });
});
