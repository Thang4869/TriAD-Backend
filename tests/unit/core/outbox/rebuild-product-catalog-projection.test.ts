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

    const create = vi.fn().mockResolvedValue(undefined);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const aggregate = vi.fn().mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { rating: 2 },
    });
    const queryRaw = vi.fn().mockResolvedValue([]);
    const transaction = vi.fn();

    const db = {
      product: { findMany },
      productCatalogProjection: { create, updateMany },
      review: { aggregate },
      $queryRaw: queryRaw,
      $transaction: transaction,
    };
    transaction.mockImplementation((callback) => callback(db));

    const processed = await rebuildProductCatalogProjection(db as never, 100);

    expect(processed).toBe(1);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-1",
        avgRating: 4.5,
        reviewCount: 2,
        sourceVersion: 3,
      }),
    });
  });
});
describe("rebuildProductCatalogProjection edge cases", () => {
  it("rebuilds products without reviews and normalizes a missing description", async () => {
    const product = {
      id: "product-no-reviews",
      name: "Product without reviews",
      description: null,
      price: 50,
      stock: 0,
      category: "Category",
      images: [],
      slug: "product-no-reviews",
      isActive: true,
      version: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      reviews: [],
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([product])
      .mockResolvedValueOnce([]);
    const create = vi.fn().mockResolvedValue(undefined);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = vi.fn();
    const db = {
      product: { findMany },
      productCatalogProjection: { create, updateMany },
      review: {
        aggregate: vi
          .fn()
          .mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: transaction,
    };
    transaction.mockImplementation((callback) => callback(db));
    await expect(
      rebuildProductCatalogProjection(db as never, 10),
    ).resolves.toBe(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-no-reviews",
        avgRating: 0,
        reviewCount: 0,
        searchText: "Product without reviews  Category",
      }),
    });
  });
});
