import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";
import config from "@config";

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
