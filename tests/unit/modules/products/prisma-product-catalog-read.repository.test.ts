import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaProductCatalogReadRepository } from "@modules/products/infrastructure/repositories/prisma-product-catalog-read.repository";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    productCatalogProjection: {
      findMany: mocks.findMany,
      count: mocks.count,
      groupBy: mocks.groupBy,
    },
  },
}));

const row = {
  productId: "product-1",
  name: "Shirt",
  description: "Cotton shirt",
  price: 125000,
  stock: 4,
  category: "clothing",
  images: ["shirt.jpg"],
  slug: "shirt",
  isActive: true,
  avgRating: 4.5,
  reviewCount: 2,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("PrismaProductCatalogReadRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.groupBy.mockResolvedValue([]);
  });

  it("queries and maps catalog rows into list items", async () => {
    mocks.findMany.mockResolvedValue([row]);
    const result = await new PrismaProductCatalogReadRepository().findMany({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      skip: 5,
      take: 10,
    } as never);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      skip: 5,
      take: 10,
    });
    expect(result[0]).toMatchObject({
      id: "product-1",
      name: "Shirt",
      price: 125000,
      stock: 4,
      images: ["shirt.jpg"],
    });
  });

  it("counts catalog rows using the supplied filter", async () => {
    mocks.count.mockResolvedValue(9);
    await expect(
      new PrismaProductCatalogReadRepository().count({
        isActive: true,
      } as never),
    ).resolves.toBe(9);
    expect(mocks.count).toHaveBeenCalledWith({ where: { isActive: true } });
  });

  it("groups active products by category", async () => {
    mocks.groupBy.mockResolvedValue([
      { category: "clothing", _count: { category: 3 } },
      { category: "shoes", _count: { category: 2 } },
    ]);
    await expect(
      new PrismaProductCatalogReadRepository().groupByCategory(),
    ).resolves.toEqual([
      { category: "clothing", count: 3 },
      { category: "shoes", count: 2 },
    ]);
    expect(mocks.groupBy).toHaveBeenCalledWith({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    });
  });

  it("searches active products with case-insensitive matching and maps results", async () => {
    mocks.findMany.mockResolvedValue([row]);
    const result = await new PrismaProductCatalogReadRepository().search(
      "shirt",
      0,
      5,
    );
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        searchText: { contains: "shirt", mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 5,
    });
    expect(result[0].id).toBe("product-1");
  });

  it("counts search matches using the same active and text filters", async () => {
    mocks.count.mockResolvedValue(2);
    await expect(
      new PrismaProductCatalogReadRepository().countSearch("shirt"),
    ).resolves.toBe(2);
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        searchText: { contains: "shirt", mode: "insensitive" },
      },
    });
  });
});
