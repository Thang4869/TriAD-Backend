import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { WishlistController } from "@modules/wishlist/wishlist.controller";
import { IWishlistService } from "@modules/wishlist/wishlist.service";

function createFakeService(
  overrides: Partial<IWishlistService> = {},
): IWishlistService {
  return {
    getWishlist: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    }),
    addItem: vi.fn(),
    removeItem: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("WishlistController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getWishlist trả về 200 kèm data từ service, lấy userId từ req.user", async () => {
    const service = createFakeService({
      getWishlist: vi.fn().mockResolvedValue({
        items: [{ id: "w1" }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    });
    const controller = new WishlistController(service);
    const req = { user: { id: "user-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.getWishlist(req, res, vi.fn());

    expect(service.getWishlist).toHaveBeenCalledWith(
      "user-1",
      undefined,
      undefined,
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [{ id: "w1" }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });
  });

  it("getWishlist parse đúng page/limit từ query string sang number", async () => {
    const service = createFakeService();
    const controller = new WishlistController(service);
    const req = {
      user: { id: "user-1" },
      query: { page: "2", limit: "5" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.getWishlist(req, res, vi.fn());

    expect(service.getWishlist).toHaveBeenCalledWith("user-1", 2, 5);
  });

  it("addItem trả về 201 kèm data khi thêm thành công", async () => {
    const service = createFakeService({
      addItem: vi.fn().mockResolvedValue({ id: "w1", productId: "product-1" }),
    });
    const controller = new WishlistController(service);
    const req = {
      user: { id: "user-1" },
      body: { productId: "product-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.addItem(req, res, vi.fn());

    expect(service.addItem).toHaveBeenCalledWith("user-1", "product-1");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: "w1", productId: "product-1" },
    });
  });

  it("removeItem trả về 200 với data: null khi xoá thành công", async () => {
    const service = createFakeService();
    const controller = new WishlistController(service);
    const req = {
      user: { id: "user-1" },
      params: { productId: "product-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.removeItem(req, res, vi.fn());

    expect(service.removeItem).toHaveBeenCalledWith("user-1", "product-1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it("lỗi từ service được ném ra để asyncHandler/error-middleware xử lý, không bị nuốt trong controller", async () => {
    const boom = new Error("boom");
    const service = createFakeService({
      addItem: vi.fn().mockRejectedValue(boom),
    });
    const controller = new WishlistController(service);
    const req = {
      user: { id: "user-1" },
      body: { productId: "product-1" },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn();

    controller.addItem(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(boom));
  });
});
