import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/app";
import config from "@config";
import type { NextFunction, Request, Response } from "express";

vi.mock("express-rate-limit", () => ({
  default: vi.fn().mockImplementation(() => {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }),
}));

vi.mock("@/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/container")>();

  return {
    ...actual,
    authMiddleware: (_req: Request, _res: Response, next: NextFunction) =>
      next(),
  };
});

describe("production authentication origin boundary", () => {
  const original = {
    isDevelopment: config.isDevelopment,
    isProduction: config.isProduction,
    CORS_ORIGIN: config.CORS_ORIGIN,
  };
  beforeEach(() =>
    Object.assign(config, {
      isDevelopment: false,
      isProduction: true,
      CORS_ORIGIN: ["https://frontend.example"],
    }),
  );
  afterEach(() => {
    Object.assign(config, original);
  });

  it("allows the exact HTTPS origin and credentials on the JSON preflight", async () => {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://frontend.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://frontend.example",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "x-csrf-token",
    );
  });

  it.each([
    "https://csrf-probe.invalid",
    "https://frontend.example.attacker.invalid",
    "null",
  ])(
    "rejects login from an untrusted Origin before issuing cookies: %s",
    async (origin) => {
      const response = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({});
      expect(response.status).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      expect(response.get("Set-Cookie")).toBeUndefined();
    },
  );

  it("rejects originless public form authentication in production", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .type("form")
      .send({ email: "fixture@example.invalid", password: "fixture" });
    expect(response.status).toBe(403);
    expect(response.get("Set-Cookie")).toBeUndefined();
  });

  it("allows JSON non-browser login to reach input validation without requiring old cookie CSRF", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Cookie", "accessToken=legacy-cookie")
      .send({});
    expect(response.status).toBe(400);
    expect(response.get("Set-Cookie")).toBeUndefined();
  });
});

describe("global CSRF protection", () => {
  it("rejects an unsafe cookie-authenticated write without CSRF", async () => {
    const response = await request(app)
      .post("/api/cart/items")
      .set("Cookie", ["accessToken=opaque-access-token"])
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(403);
  });

  it("does not turn Bearer requests into CSRF failures", async () => {
    const response = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer opaque-access-token")
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).not.toBe(403);
  });

  it("rejects an unlisted localhost origin in production", async () => {
    const previous = {
      isDevelopment: config.isDevelopment,
      isProduction: config.isProduction,
      corsOrigin: config.CORS_ORIGIN,
    };
    Object.assign(config, {
      isDevelopment: false,
      isProduction: true,
      CORS_ORIGIN: ["https://frontend.example"],
    });
    try {
      const response = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:9999");
      expect(response.status).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      Object.assign(config, {
        isDevelopment: previous.isDevelopment,
        isProduction: previous.isProduction,
        CORS_ORIGIN: previous.corsOrigin,
      });
    }
  });
});
