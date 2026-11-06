import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { OrdersController } from "@modules/orders/orders.controller";
import type { IOrdersService } from "@modules/orders/orders.service";

function resMock() { const res = {} as Response; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }
function reqMock(overrides: Record<string, unknown> = {}) { return { params: {}, query: {}, body: {}, user: { id: "u1", role: "USER" }, ...overrides } as unknown as Request; }
describe("OrdersController", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gets the authenticated user's orders with parsed pagination", async () => {
    const service = { getOrders: vi.fn().mockResolvedValue({ orders: [] }) } as unknown as IOrdersService; const res = resMock();
    await new OrdersController(service).getMyOrders(reqMock({ query: { page: "2", limit: "7" } }), res, vi.fn());
    expect(service.getOrders).toHaveBeenCalledWith("u1", 2, 7);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { orders: [] } });
  });
  it("scopes single-order lookup to the authenticated user", async () => {
    const service = { getOrderById: vi.fn().mockResolvedValue({ id: "o1" }) } as unknown as IOrdersService;
    await new OrdersController(service).getMyOrder(reqMock({ params: { orderId: "o1" } }), resMock(), vi.fn());
    expect(service.getOrderById).toHaveBeenCalledWith("o1", "u1");
  });
  it("rejects non-admin access to all orders", async () => {
    const service = { adminGetOrders: vi.fn() } as unknown as IOrdersService; const next = vi.fn();
    await new OrdersController(service).adminGetOrders(reqMock(), resMock(), next);
    expect(service.adminGetOrders).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Admin access required" }));
  });
  it("rejects non-admin status updates", async () => {
    const service = { updateOrderStatus: vi.fn() } as unknown as IOrdersService; const next = vi.fn();
    await new OrdersController(service).adminUpdateStatus(reqMock({ params: { orderId: "o1" }, body: { status: "SHIPPED" } }), resMock(), next);
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Admin access required" }));
  });
  it("returns 400 for an invalid status without calling the service", async () => {
    const service = { updateOrderStatus: vi.fn() } as unknown as IOrdersService; const res = resMock();
    await new OrdersController(service).adminUpdateStatus(reqMock({ params: { orderId: "o1" }, user: { id: "admin", role: "ADMIN" }, body: { status: "INVALID" } }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
  });
});
