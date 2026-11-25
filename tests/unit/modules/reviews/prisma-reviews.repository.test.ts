import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaReviewsRepository } from "@modules/reviews/infrastructure/repositories/prisma-reviews.repository";

const mocks = vi.hoisted(() => ({
  review: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  product: { findUnique: vi.fn() },
  transaction: vi.fn(),
  txReview: { create: vi.fn(), delete: vi.fn() },
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    review: mocks.review,
    product: mocks.product,
    $transaction: mocks.transaction,
  },
}));

const review = {
  id: "review-1",
  userId: "user-1",
  productId: "product-1",
  rating: 5,
  comment: "Excellent",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  user: {
    id: "user-1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
  },
};

describe("PrismaReviewsRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.review.findMany.mockResolvedValue([]);
    mocks.review.count.mockResolvedValue(0);
    mocks.review.findFirst.mockResolvedValue(null);
    mocks.review.findUnique.mockResolvedValue(null);
    mocks.product.findUnique.mockResolvedValue(null);
    mocks.txReview.create.mockResolvedValue(review);
    mocks.txReview.delete.mockResolvedValue({ productId: "product-1" });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ review: mocks.txReview }),
    );
  });

  it("lists product reviews with reviewer details and pagination", async () => {
    mocks.review.findMany.mockResolvedValue([review]);

    await expect(
      new PrismaReviewsRepository().findByProduct("product-1", 5, 10),
    ).resolves.toEqual([review]);

    expect(mocks.review.findMany).toHaveBeenCalledWith({
      where: { productId: "product-1" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: 5,
      take: 10,
    });
  });

  it("counts reviews for a product", async () => {
    mocks.review.count.mockResolvedValue(4);

    await expect(
      new PrismaReviewsRepository().countByProduct("product-1"),
    ).resolves.toBe(4);

    expect(mocks.review.count).toHaveBeenCalledWith({
      where: { productId: "product-1" },
    });
  });

  it("checks product existence", async () => {
    mocks.product.findUnique.mockResolvedValue({ id: "product-1" });

    await expect(
      new PrismaReviewsRepository().productExists("product-1"),
    ).resolves.toBe(true);

    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { id: "product-1" },
      select: { id: true },
    });

    mocks.product.findUnique.mockResolvedValue(null);
    await expect(
      new PrismaReviewsRepository().productExists("missing"),
    ).resolves.toBe(false);
  });

  it("finds a user's review for a product", async () => {
    const record = { id: "review-1", userId: "user-1", productId: "product-1" };
    mocks.review.findFirst.mockResolvedValue(record);

    await expect(
      new PrismaReviewsRepository().findByUserAndProduct("user-1", "product-1"),
    ).resolves.toEqual(record);

    expect(mocks.review.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", productId: "product-1" },
      select: { id: true, userId: true, productId: true },
    });
  });

  it("creates a review and persists its domain event in the same transaction", async () => {
    const persistEvents = vi.fn().mockResolvedValue(undefined);

    await expect(
      new PrismaReviewsRepository(persistEvents).create({
        userId: "user-1",
        productId: "product-1",
        rating: 5,
        comment: "Excellent",
      }),
    ).resolves.toEqual(review);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.txReview.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        productId: "product-1",
        rating: 5,
        comment: "Excellent",
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
    expect(persistEvents).toHaveBeenCalledWith({ review: mocks.txReview }, [
      expect.objectContaining({ productId: "product-1" }),
    ]);
  });

  it("finds a review by id", async () => {
    const record = { id: "review-1", userId: "user-1", productId: "product-1" };
    mocks.review.findUnique.mockResolvedValue(record);

    await expect(
      new PrismaReviewsRepository().findById("review-1"),
    ).resolves.toEqual(record);

    expect(mocks.review.findUnique).toHaveBeenCalledWith({
      where: { id: "review-1" },
      select: { id: true, userId: true, productId: true },
    });
  });

  it("deletes a review and persists its domain event transactionally", async () => {
    const persistEvents = vi.fn().mockResolvedValue(undefined);

    await expect(
      new PrismaReviewsRepository(persistEvents).delete("review-1"),
    ).resolves.toBeUndefined();

    expect(mocks.txReview.delete).toHaveBeenCalledWith({
      where: { id: "review-1" },
      select: { productId: true },
    });
    expect(persistEvents).toHaveBeenCalledWith({ review: mocks.txReview }, [
      expect.objectContaining({ productId: "product-1" }),
    ]);
  });

  it("lists all reviews for admin with reviewer and product summaries", async () => {
    const adminReview = {
      ...review,
      product: { id: "product-1", name: "Shirt", images: ["shirt.jpg"] },
    };
    mocks.review.findMany.mockResolvedValue([adminReview]);

    await expect(
      new PrismaReviewsRepository().findAllAdmin(2, 8),
    ).resolves.toEqual([adminReview]);

    expect(mocks.review.findMany).toHaveBeenCalledWith({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        product: { select: { id: true, name: true, images: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: 2,
      take: 8,
    });
  });

  it("counts all reviews", async () => {
    mocks.review.count.mockResolvedValue(12);

    await expect(new PrismaReviewsRepository().count()).resolves.toBe(12);
    expect(mocks.review.count).toHaveBeenCalledWith();
  });
});
