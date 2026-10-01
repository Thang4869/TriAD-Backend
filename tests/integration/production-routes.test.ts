import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@config")>();

  const productionConfig = {
    ...actual.default,
    NODE_ENV: "production" as const,
    isProduction: true,
    isDevelopment: false,
    isTest: false,
  };

  return {
    ...actual,
    default: productionConfig,
    config: productionConfig,
  };
});

import app from "@/app";

describe("Production route protection", () => {
  it("does not expose /metrics in production", async () => {
    const response = await request(app).get("/metrics");

    expect(response.status).toBe(404);
  });

  it("does not expose /api/docs in production", async () => {
    const response = await request(app).get("/api/docs");

    expect(response.status).toBe(404);
  });
});
