import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { ReviewsController } from "@modules/reviews/reviews.controller";
import type { ReviewsService } from "@modules/reviews/reviews.service";
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
describe("ReviewsController", () => {
  beforeEach(() => vi.clearAllMocks());
  it("parses product review pagination and returns results", async () => {
    const service = {
      getReviewsByProduct: vi.fn().mockResolvedValue({ reviews: [], total: 0 }),
    } as unknown as ReviewsService;
    const res = resMock();
    await new ReviewsController(service).getByProduct(
      reqMock({
        params: { productId: "p1" },
        query: { page: "2", limit: "4" },
      }),
      res,
      vi.fn(),
    );
    expect(service.getReviewsByProduct).toHaveBeenCalledWith("p1", 2, 4);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { reviews: [], total: 0 },
    });
  });
  it("rejects missing review fields", async () => {
    const service = { createReview: vi.fn() } as unknown as ReviewsService;
    const next = vi.fn();
    await new ReviewsController(service).create(reqMock(), resMock(), next);
    expect(service.createReview).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "productId, rating and content are required",
      }),
    );
  });
  it("rejects ratings outside the inclusive 1-5 range", async () => {
    const service = { createReview: vi.fn() } as unknown as ReviewsService;
    const next = vi.fn();
    await new ReviewsController(service).create(
      reqMock({ body: { productId: "p1", rating: 6, content: "x" } }),
      resMock(),
      next,
    );
    expect(service.createReview).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Rating must be between 1 and 5" }),
    );
  });
  it("passes the admin role to delete authorization", async () => {
    const service = {
      deleteReview: vi.fn().mockResolvedValue({ deleted: true }),
    } as unknown as ReviewsService;
    await new ReviewsController(service).delete(
      reqMock({
        params: { reviewId: "r1" },
        user: { id: "admin", role: "ADMIN" },
      }),
      resMock(),
      vi.fn(),
    );
    expect(service.deleteReview).toHaveBeenCalledWith("r1", "admin", true);
  });
  it("rejects non-admin access to the admin listing", async () => {
    const service = { adminGetAll: vi.fn() } as unknown as ReviewsService;
    const next = vi.fn();
    await new ReviewsController(service).adminGetAll(
      reqMock(),
      resMock(),
      next,
    );
    expect(service.adminGetAll).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Admin access required" }),
    );
  });
});

describe("ReviewsController remaining branches", () => {
  it("uses default pagination when product review query values are absent", async () => {
    const service = {
      getReviewsByProduct: vi.fn().mockResolvedValue({ reviews: [] }),
    } as unknown as ReviewsService;

    await new ReviewsController(service).getByProduct(
      reqMock({ params: { productId: "p1" } }),
      resMock(),
      vi.fn(),
    );

    expect(service.getReviewsByProduct).toHaveBeenCalledWith("p1", 1, 10);
  });

  it("creates a review with a valid rating and all required fields", async () => {
    const service = {
      createReview: vi.fn().mockResolvedValue({ id: "review-1" }),
    } as unknown as ReviewsService;
    const res = resMock();

    await new ReviewsController(service).create(
      reqMock({
        body: { productId: "p1", rating: 5, content: "Great product" },
      }),
      res,
      vi.fn(),
    );

    expect(service.createReview).toHaveBeenCalledWith(
      "u1",
      "p1",
      5,
      "Great product",
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects a rating below the minimum", async () => {
    const service = { createReview: vi.fn() } as unknown as ReviewsService;
    const next = vi.fn();

    await new ReviewsController(service).create(
      reqMock({
        body: { productId: "p1", rating: -1, content: "Invalid" },
      }),
      resMock(),
      next,
    );

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Rating must be between 1 and 5" }),
      );
    });
  });

  it("deletes a review for a non-admin without audit logging", async () => {
    const service = {
      deleteReview: vi.fn().mockResolvedValue({ deleted: true }),
    } as unknown as ReviewsService;
    const res = resMock();

    await new ReviewsController(service).delete(
      reqMock({
        params: { reviewId: "r1" },
        user: { id: "u1", role: "USER" },
      }),
      res,
      vi.fn(),
    );

    expect(service.deleteReview).toHaveBeenCalledWith("r1", "u1", false);
    expect(res.json).toHaveBeenCalled();
  });

  it("records admin review deletion through the audit service", async () => {
    const service = {
      deleteReview: vi.fn().mockResolvedValue({ deleted: true }),
    } as unknown as ReviewsService;
    const recordMutation = vi.fn(
      async (
        _req: unknown,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    );

    await new ReviewsController(service, {
      recordMutation,
    } as unknown as AuditService).delete(
      reqMock({
        params: { reviewId: "r1" },
        user: { id: "admin-1", role: "ADMIN" },
      }),
      resMock(),
      vi.fn(),
    );

    expect(recordMutation).toHaveBeenCalledOnce();
    expect(service.deleteReview).toHaveBeenCalledWith("r1", "admin-1", true);
  });

  it("allows admins to list reviews with parsed pagination", async () => {
    const service = {
      adminGetAll: vi.fn().mockResolvedValue({ reviews: [] }),
    } as unknown as ReviewsService;

    await new ReviewsController(service).adminGetAll(
      reqMock({
        user: { id: "admin-1", role: "ADMIN" },
        query: { page: "2", limit: "6" },
      }),
      resMock(),
      vi.fn(),
    );

    expect(service.adminGetAll).toHaveBeenCalledWith(2, 6);
  });

  it("uses default pagination for admin review listing", async () => {
    const service = {
      adminGetAll: vi.fn().mockResolvedValue({ reviews: [] }),
    } as unknown as ReviewsService;

    await new ReviewsController(service).adminGetAll(
      reqMock({ user: { id: "admin-1", role: "ADMIN" } }),
      resMock(),
      vi.fn(),
    );

    expect(service.adminGetAll).toHaveBeenCalledWith(1, 10);
  });
});
