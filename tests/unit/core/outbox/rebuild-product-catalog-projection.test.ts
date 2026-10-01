import { describe, expect, it, vi } from "vitest";
import { rebuildProductCatalogProjection } from "@core/outbox/rebuild-product-catalog-projection";

describe("rebuildProductCatalogProjection", () => {
  it("rebuilds product catalog with rating aggregates", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "product-1",
          name: "Product 1",
          description: "Description",
          price: 100,
          stock: 5,
          category: "Category",
          images: ["image.jpg"],
          slug: "product-1",
          isActive: true,
          version: 3,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          reviews: [{ rating: 4 }, { rating: 5 }],
        },
      ])
      .mockResolvedValueOnce([]);

    const upsert = vi.fn().mockReturnValue({ operation: "upsert" });
    const transaction = vi.fn().mockResolvedValue([]);

    const db = {
      product: { findMany },
      productCatalogProjection: { upsert },
      $transaction: transaction,
    };

    const processed = await rebuildProductCatalogProjection(db as never, 100);

    expect(processed).toBe(1);

    expect(upsert).toHaveBeenCalledWith({
      where: { productId: "product-1" },
      create: expect.objectContaining({
        productId: "product-1",
        avgRating: 4.5,
        reviewCount: 2,
        sourceVersion: 3,
      }),
      update: expect.objectContaining({
        avgRating: 4.5,
        reviewCount: 2,
        sourceVersion: 3,
      }),
    });

    expect(transaction).toHaveBeenCalledOnce();
  });
});
