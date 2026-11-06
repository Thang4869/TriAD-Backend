import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { CheckoutController } from "@modules/checkout/checkout.controller";
import type { CheckoutService } from "@modules/checkout/checkout.service";

function makeResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

describe("CheckoutController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("quotes checkout without a discount code and disables caching", async () => {
    const quote = { subtotal: 100, total: 100 };
    const service = { quote: vi.fn().mockResolvedValue(quote) } as unknown as CheckoutService;
    const res = makeResponse();

    await new CheckoutController(service).quote(makeRequest(), res, vi.fn());

    expect(service.quote).toHaveBeenCalledWith("user-1", undefined);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: quote });
  });

  it("passes a string discount code to the quote service", async () => {
    const service = { quote: vi.fn().mockResolvedValue({ total: 90 }) } as unknown as CheckoutService;

    await new CheckoutController(service).quote(
      makeRequest({ query: { discountCode: "SAVE10" } }),
      makeResponse(),
      vi.fn(),
    );

    expect(service.quote).toHaveBeenCalledWith("user-1", "SAVE10");
  });

  it("ignores non-string discountCode query values", async () => {
    const service = { quote: vi.fn().mockResolvedValue({ total: 100 }) } as unknown as CheckoutService;

    await new CheckoutController(service).quote(
      makeRequest({ query: { discountCode: ["SAVE10"] } }),
      makeResponse(),
      vi.fn(),
    );

    expect(service.quote).toHaveBeenCalledWith("user-1", undefined);
  });

  it("creates checkout using the authenticated user and request body", async () => {
    const result = { orderId: "order-1" };
    const service = { checkout: vi.fn().mockResolvedValue(result) } as unknown as CheckoutService;
    const res = makeResponse();

    await new CheckoutController(service).checkout(
      makeRequest({ body: { paymentMethod: "COD" } }),
      res,
      vi.fn(),
    );

    expect(service.checkout).toHaveBeenCalledWith("user-1", { paymentMethod: "COD" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it("uses default pagination when page and limit are omitted", async () => {
    const service = { getOrders: vi.fn().mockResolvedValue({ orders: [] }) } as unknown as CheckoutService;

    await new CheckoutController(service).getOrders(makeRequest(), makeResponse(), vi.fn());

    expect(service.getOrders).toHaveBeenCalledWith("user-1", 1, 10);
  });

  it("converts supplied pagination values to numbers", async () => {
    const service = { getOrders: vi.fn().mockResolvedValue({ orders: [] }) } as unknown as CheckoutService;

    await new CheckoutController(service).getOrders(
      makeRequest({ query: { page: "3", limit: "25" } }),
      makeResponse(),
      vi.fn(),
    );

    expect(service.getOrders).toHaveBeenCalledWith("user-1", 3, 25);
  });

  it("loads an order scoped to the authenticated user", async () => {
    const order = { id: "order-1" };
    const service = { getOrder: vi.fn().mockResolvedValue(order) } as unknown as CheckoutService;
    const res = makeResponse();

    await new CheckoutController(service).getOrder(
      makeRequest({ params: { orderId: "order-1" } }),
      res,
      vi.fn(),
    );

    expect(service.getOrder).toHaveBeenCalledWith("order-1", "user-1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: order });
  });
});
