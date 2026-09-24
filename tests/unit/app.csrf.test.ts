import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";

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
});
