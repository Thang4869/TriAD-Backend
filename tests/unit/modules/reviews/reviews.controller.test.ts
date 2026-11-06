import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { ReviewsController } from "@modules/reviews/reviews.controller";
import type { ReviewsService } from "@modules/reviews/reviews.service";

function resMock() { const res = {} as Response; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }
function reqMock(overrides: Record<string, unknown> = {}) { return { params: {}, query: {}, body: {}, user: { id: "u1", role: "USER" }, ...overrides } as unknown as Request; }
describe("ReviewsController", () => {
  beforeEach(() => vi.clearAllMocks());
  it("parses product review pagination and returns results", async () => {
    const service = { getReviewsByProduct: vi.fn().mockResolvedValue({ reviews: [], total: 0 }) } as unknown as ReviewsService;
    const res = resMock();
    await new ReviewsController(service).getByProduct(reqMock({ params: { productId: "p1" }, query: { page: "2", limit: "4" } }), res, vi.fn());
    expect(service.getReviewsByProduct).toHaveBeenCalledWith("p1", 2, 4);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { reviews: [], total: 0 } });
  });
  it("rejects missing review fields", async () => {
    const service = { createReview: vi.fn() } as unknown as ReviewsService; const next = vi.fn();
    await new ReviewsController(service).create(reqMock(), resMock(), next);
    expect(service.createReview).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "productId, rating and content are required" }));
  });
  it("rejects ratings outside the inclusive 1-5 range", async () => {
    const service = { createReview: vi.fn() } as unknown as ReviewsService; const next = vi.fn();
    await new ReviewsController(service).create(reqMock({ body: { productId: "p1", rating: 6, content: "x" } }), resMock(), next);
    expect(service.createReview).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Rating must be between 1 and 5" }));
  });
  it("passes the admin role to delete authorization", async () => {
    const service = { deleteReview: vi.fn().mockResolvedValue({ deleted: true }) } as unknown as ReviewsService;
    await new ReviewsController(service).delete(reqMock({ params: { reviewId: "r1" }, user: { id: "admin", role: "ADMIN" } }), resMock(), vi.fn());
    expect(service.deleteReview).toHaveBeenCalledWith("r1", "admin", true);
  });
  it("rejects non-admin access to the admin listing", async () => {
    const service = { adminGetAll: vi.fn() } as unknown as ReviewsService; const next = vi.fn();
    await new ReviewsController(service).adminGetAll(reqMock(), resMock(), next);
    expect(service.adminGetAll).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Admin access required" }));
  });
});
