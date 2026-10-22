import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutService } from "@modules/checkout/checkout.service";

const { quote } = vi.hoisted(() => ({ quote: vi.fn() }));

vi.mock("@/container", async () => {
  const { CheckoutController } =
    await import("@modules/checkout/checkout.controller");
  const service = {
    quote,
    checkout: vi.fn(),
    getOrders: vi.fn(),
    getOrder: vi.fn(),
  };
  return {
    checkoutController: new CheckoutController(
      service as unknown as CheckoutService,
    ),
    authMiddleware: (req: Request, res: Response, next: NextFunction) => {
      if (!req.headers["x-test-auth"]) return res.sendStatus(401);
      req.user = {
        id: "quote-user",
        email: "quote@example.invalid",
        role: "USER",
      };
      next();
    },
  };
});

vi.mock("@shared/middlewares/idempotency.middleware", () => ({
  idempotencyMiddleware:
    () => (_req: Request, _res: Response, next: NextFunction) =>
      next(),
}));

import { checkoutRoutes } from "@modules/checkout/checkout.routes";

const app = express();
app.use("/api/checkout", checkoutRoutes);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({
    error: error instanceof Error ? error.message : "Invalid request",
  });
});

describe("Checkout quote HTTP boundary", () => {
  beforeEach(() => {
    quote.mockReset();
    quote.mockResolvedValue({
      subtotal: 150000,
      tax: 15000,
      shippingFee: 30000,
      discountAmount: 0,
      total: 195000,
    });
  });

  it("requires authentication before reading cart pricing", async () => {
    const response = await request(app).get("/api/checkout/quote");
    expect(response.status).toBe(401);
    expect(quote).not.toHaveBeenCalled();
  });

  it("quotes the authenticated cart with validated discount and no caching", async () => {
    const response = await request(app)
      .get("/api/checkout/quote")
      .set("x-test-auth", "yes")
      .query({ discountCode: " SAVE10 " });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data.total).toBe(195000);
    expect(quote).toHaveBeenCalledWith("quote-user", "SAVE10");
  });

  it("rejects malformed discount input before invoking pricing", async () => {
    const response = await request(app)
      .get("/api/checkout/quote?discountCode[]=SAVE10")
      .set("x-test-auth", "yes");
    expect(response.status).toBe(400);
    expect(quote).not.toHaveBeenCalled();
  });
});
