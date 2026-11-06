import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const registry = vi.hoisted(() => ({
  contentType: "text/plain; version=0.0.4; charset=utf-8",
  metrics: vi.fn(),
}));

vi.mock("@core/metrics/metrics.registry", () => ({
  metricsRegistry: registry,
}));

import { metricsRoutes } from "@core/metrics/metrics.routes";

describe("metricsRoutes", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns Prometheus metrics with the registry content type", async () => {
    registry.metrics.mockResolvedValue("# HELP requests_total Total requests\nrequests_total 2\n");
    const app = express().use("/metrics", metricsRoutes);

    const response = await request(app).get("/metrics/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("requests_total 2");
    expect(registry.metrics).toHaveBeenCalledOnce();
  });
});
