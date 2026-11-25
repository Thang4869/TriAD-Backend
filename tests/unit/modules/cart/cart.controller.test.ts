import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { CartController } from "@modules/cart/cart.controller";
import type { ICartService } from "@modules/cart/cart.service";

function resMock() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
function reqMock(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    user: { id: "u1" },
    ...overrides,
  } as unknown as Request;
}
describe("CartController", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns the authenticated user's cart", async () => {
    const service = {
      getCart: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ICartService;
    const res = resMock();
    await new CartController(service).getCart(reqMock(), res, vi.fn());
    expect(service.getCart).toHaveBeenCalledWith("u1");
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { items: [] },
    });
  });
  it("requires productId before adding an item", async () => {
    const service = { addItem: vi.fn() } as unknown as ICartService;
    const next = vi.fn();
    await new CartController(service).addItem(
      reqMock({ body: { quantity: 1 } }),
      resMock(),
      next,
    );
    expect(service.addItem).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "productId is required" }),
    );
  });
  it.each([0, -1, null])(
    "rejects non-positive quantity %s",
    async (quantity) => {
      const service = { addItem: vi.fn() } as unknown as ICartService;
      const next = vi.fn();
      await new CartController(service).addItem(
        reqMock({ body: { productId: "p1", quantity } }),
        resMock(),
        next,
      );
      expect(service.addItem).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: "quantity must be greater than 0" }),
      );
    },
  );
  it("rejects missing or negative update quantity", async () => {
    const service = { updateItem: vi.fn() } as unknown as ICartService;
    const next = vi.fn();
    await new CartController(service).updateItem(
      reqMock({ params: { productId: "p1" }, body: {} }),
      resMock(),
      next,
    );
    expect(service.updateItem).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "quantity is required and must be >= 0",
      }),
    );
  });
  it("allows zero quantity to reach service for item removal", async () => {
    const service = {
      updateItem: vi.fn().mockResolvedValue(null),
    } as unknown as ICartService;
    await new CartController(service).updateItem(
      reqMock({ params: { productId: "p1" }, body: { quantity: 0 } }),
      resMock(),
      vi.fn(),
    );
    expect(service.updateItem).toHaveBeenCalledWith("u1", "p1", 0);
  });
  it("clears the cart and returns service result", async () => {
    const service = {
      clearCart: vi.fn().mockResolvedValue({ cleared: true }),
    } as unknown as ICartService;
    const res = resMock();
    await new CartController(service).clearCart(reqMock(), res, vi.fn());
    expect(service.clearCart).toHaveBeenCalledWith("u1");
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { cleared: true },
    });
  });
});

describe("CartController successful mutations", () => {
  it("adds an item when product and positive quantity are valid", async () => {
    const service = {
      addItem: vi.fn().mockResolvedValue({ productId: "p1", quantity: 2 }),
    } as unknown as ICartService;
    const res = resMock();

    await new CartController(service).addItem(
      reqMock({ body: { productId: "p1", quantity: 2 } }),
      res,
      vi.fn(),
    );

    expect(service.addItem).toHaveBeenCalledWith("u1", "p1", 2);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects a negative update quantity", async () => {
    const service = { updateItem: vi.fn() } as unknown as ICartService;
    const next = vi.fn();

    await new CartController(service).updateItem(
      reqMock({
        params: { productId: "p1" },
        body: { quantity: -1 },
      }),
      resMock(),
      next,
    );

    expect(service.updateItem).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "quantity is required and must be >= 0",
      }),
    );
  });

  it("removes an item from the authenticated user's cart", async () => {
    const service = {
      removeItem: vi.fn().mockResolvedValue(undefined),
    } as unknown as ICartService;
    const res = resMock();

    await new CartController(service).removeItem(
      reqMock({ params: { productId: "p1" } }),
      res,
      vi.fn(),
    );

    expect(service.removeItem).toHaveBeenCalledWith("u1", "p1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });
});
