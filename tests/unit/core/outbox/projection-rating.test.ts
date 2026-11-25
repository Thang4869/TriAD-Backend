import { describe, expect, it, vi } from "vitest";
import { refreshProductRatingProjection } from "@core/outbox/projection-rating";

describe("refreshProductRatingProjection", () => {
  it("writes zero when no reviews have an average rating", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      review: {
        aggregate: vi
          .fn()
          .mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } }),
      },
      productCatalogProjection: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await refreshProductRatingProjection(
      db as never,
      "product-without-reviews",
    );
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.review.aggregate).toHaveBeenCalledWith({
      where: { productId: "product-without-reviews" },
      _avg: { rating: true },
      _count: { rating: true },
    });
    expect(db.productCatalogProjection.updateMany).toHaveBeenCalledWith({
      where: { productId: "product-without-reviews" },
      data: { avgRating: 0, reviewCount: 0 },
    });
  });
});
