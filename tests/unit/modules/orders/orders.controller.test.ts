import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { OrdersController } from "@modules/orders/orders.controller";
import type { IOrdersService } from "@modules/orders/orders.service";
import { OrderStatus } from "@modules/orders/domain/order-status";
import type { AuditService } from "@modules/admin/audit/application/audit.service";

function resMock() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
function reqMock(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: "u1", role: "USER" },
    ...overrides,
  } as unknown as Request;
}
describe("OrdersController", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gets the authenticated user's orders with parsed pagination", async () => {
    const service = {
      getOrders: vi.fn().mockResolvedValue({ orders: [] }),
    } as unknown as IOrdersService;
    const res = resMock();
    await new OrdersController(service).getMyOrders(
      reqMock({ query: { page: "2", limit: "7" } }),
      res,
      vi.fn(),
    );
    expect(service.getOrders).toHaveBeenCalledWith("u1", 2, 7);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { orders: [] },
    });
  });
  it("scopes single-order lookup to the authenticated user", async () => {
    const service = {
      getOrderById: vi.fn().mockResolvedValue({ id: "o1" }),
    } as unknown as IOrdersService;
    await new OrdersController(service).getMyOrder(
      reqMock({ params: { orderId: "o1" } }),
      resMock(),
      vi.fn(),
    );
    expect(service.getOrderById).toHaveBeenCalledWith("o1", "u1");
  });
  it("rejects non-admin access to all orders", async () => {
    const service = { adminGetOrders: vi.fn() } as unknown as IOrdersService;
    const next = vi.fn();
    await new OrdersController(service).adminGetOrders(
      reqMock(),
      resMock(),
      next,
    );
    expect(service.adminGetOrders).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Admin access required" }),
    );
  });
  it("rejects non-admin status updates", async () => {
    const service = { updateOrderStatus: vi.fn() } as unknown as IOrdersService;
    const next = vi.fn();
    await new OrdersController(service).adminUpdateStatus(
      reqMock({ params: { orderId: "o1" }, body: { status: "SHIPPED" } }),
      resMock(),
      next,
    );
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Admin access required" }),
    );
  });
  it("returns 400 for an invalid status without calling the service", async () => {
    const service = { updateOrderStatus: vi.fn() } as unknown as IOrdersService;
    const res = resMock();
    await new OrdersController(service).adminUpdateStatus(
      reqMock({
        params: { orderId: "o1" },
        user: { id: "admin", role: "ADMIN" },
        body: { status: "INVALID" },
      }),
      res,
      vi.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
  });
});

describe("OrdersController admin success paths", () => {
  it("uses default pagination for the authenticated user's orders", async () => {
    const service = {
      getOrders: vi.fn().mockResolvedValue({ orders: [] }),
    } as unknown as IOrdersService;

    await new OrdersController(service).getMyOrders(
      reqMock(),
      resMock(),
      vi.fn(),
    );

    expect(service.getOrders).toHaveBeenCalledWith("u1", 1, 10);
  });

  it("allows admins to list orders with filters and parsed pagination", async () => {
    const service = {
      adminGetOrders: vi.fn().mockResolvedValue({ orders: [] }),
    } as unknown as IOrdersService;

    await new OrdersController(service).adminGetOrders(
      reqMock({
        user: { id: "admin-1", role: "ADMIN" },
        query: {
          status: OrderStatus.PENDING,
          userId: "user-1",
          page: "3",
          limit: "5",
        },
      }),
      resMock(),
      vi.fn(),
    );

    expect(service.adminGetOrders).toHaveBeenCalledWith(
      { status: OrderStatus.PENDING, userId: "user-1" },
      3,
      5,
    );
  });

  it("uses default pagination for admin order listing", async () => {
    const service = {
      adminGetOrders: vi.fn().mockResolvedValue({ orders: [] }),
    } as unknown as IOrdersService;

    await new OrdersController(service).adminGetOrders(
      reqMock({ user: { id: "admin-1", role: "ADMIN" } }),
      resMock(),
      vi.fn(),
    );

    expect(service.adminGetOrders).toHaveBeenCalledWith({}, 1, 10);
  });

  it("rejects a missing status before calling the update service", async () => {
    const service = {
      updateOrderStatus: vi.fn(),
    } as unknown as IOrdersService;
    const res = resMock();

    await new OrdersController(service).adminUpdateStatus(
      reqMock({
        user: { id: "admin-1", role: "ADMIN" },
        params: { orderId: "order-1" },
        body: {},
      }),
      res,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("updates a valid order status without audit integration", async () => {
    const service = {
      updateOrderStatus: vi.fn().mockResolvedValue({ id: "order-1" }),
    } as unknown as IOrdersService;
    const res = resMock();

    await new OrdersController(service).adminUpdateStatus(
      reqMock({
        user: { id: "admin-1", role: "ADMIN" },
        params: { orderId: "order-1" },
        body: { status: OrderStatus.SHIPPED },
      }),
      res,
      vi.fn(),
    );

    expect(service.updateOrderStatus).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.SHIPPED,
    );
    expect(res.json).toHaveBeenCalled();
  });

  it("records valid status updates through the audit service", async () => {
    const service = {
      updateOrderStatus: vi.fn().mockResolvedValue({ id: "order-1" }),
    } as unknown as IOrdersService;
    const recordMutation = vi.fn(
      async (
        _req: unknown,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    );

    await new OrdersController(service, {
      recordMutation,
    } as unknown as AuditService).adminUpdateStatus(
      reqMock({
        user: { id: "admin-1", role: "ADMIN" },
        params: { orderId: "order-1" },
        body: { status: OrderStatus.SHIPPED },
      }),
      resMock(),
      vi.fn(),
    );

    expect(recordMutation).toHaveBeenCalledOnce();
    expect(service.updateOrderStatus).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.SHIPPED,
    );
  });
});
