import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaProductsRepository } from "@modules/products/infrastructure/repositories/prisma-products.repository";

const mocks = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  transaction: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    product: mocks.product,
    $transaction: mocks.transaction,
    $queryRaw: mocks.queryRaw,
  },
}));

const product = {
  id: "product-1",
  name: "Shirt",
  description: "Cotton shirt",
  price: 125000,
  stock: 4,
  category: "clothing",
  images: ["shirt.jpg"],
  slug: "shirt",
  isActive: true,
  version: 2,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("PrismaProductsRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.product.findMany.mockResolvedValue([]);
    mocks.product.count.mockResolvedValue(0);
    mocks.product.findUnique.mockResolvedValue(null);
    mocks.product.groupBy.mockResolvedValue([]);
    mocks.product.create.mockResolvedValue(product);
    mocks.product.update.mockResolvedValue(product);
    mocks.product.findFirst.mockResolvedValue(null);
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          product: {
            create: vi.fn().mockResolvedValue(product),
            update: vi.fn().mockResolvedValue(product),
          },
        }),
    );
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("finds products with rating reviews and safely maps prices", async () => {
    mocks.product.findMany.mockResolvedValue([
      { ...product, reviews: [{ rating: 5 }] },
    ]);
    const query = {
      where: { isActive: true },
      orderBy: { name: "asc" },
      skip: 2,
      take: 8,
    };
    await expect(
      new PrismaProductsRepository().findManyWithRatings(query as never),
    ).resolves.toMatchObject([
      { id: "product-1", price: 125000, reviews: [{ rating: 5 }] },
    ]);
    expect(mocks.product.findMany).toHaveBeenCalledWith({
      ...query,
      include: { reviews: { select: { rating: true } } },
    });
  });

  it("counts products with the supplied filter", async () => {
    mocks.product.count.mockResolvedValue(6);
    await expect(
      new PrismaProductsRepository().count({ isActive: true } as never),
    ).resolves.toBe(6);
    expect(mocks.product.count).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });

  it("maps full review details and converts price", async () => {
    mocks.product.findUnique.mockResolvedValue({
      ...product,
      reviews: [
        {
          id: "review-1",
          user: {
            id: "user-1",
            firstName: "A",
            lastName: "B",
            email: "a@example.com",
          },
        },
      ],
    });
    await expect(
      new PrismaProductsRepository().findByIdWithReviews("product-1"),
    ).resolves.toMatchObject({
      id: "product-1",
      price: 125000,
      reviews: [{ user: { email: "a@example.com" } }],
    });
    expect(mocks.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        include: expect.objectContaining({ reviews: expect.any(Object) }),
      }),
    );
  });

  it("returns null when full product details are missing", async () => {
    await expect(
      new PrismaProductsRepository().findByIdWithReviews("missing"),
    ).resolves.toBeNull();
  });

  it("maps short review details and converts price", async () => {
    mocks.product.findUnique.mockResolvedValue({
      ...product,
      reviews: [
        {
          id: "review-1",
          user: { id: "user-1", firstName: "A", lastName: "B" },
        },
      ],
    });
    await expect(
      new PrismaProductsRepository().findBySlugWithReviews("shirt"),
    ).resolves.toMatchObject({
      slug: "shirt",
      price: 125000,
      reviews: [{ user: { firstName: "A" } }],
    });
    expect(mocks.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "shirt" },
        include: expect.objectContaining({ reviews: expect.any(Object) }),
      }),
    );
  });

  it("returns null when a slug is not found", async () => {
    await expect(
      new PrismaProductsRepository().findBySlugWithReviews("missing"),
    ).resolves.toBeNull();
  });

  it("looks up a product id by slug", async () => {
    mocks.product.findUnique.mockResolvedValue({ id: "product-1" });
    await expect(
      new PrismaProductsRepository().findBySlugId("shirt"),
    ).resolves.toEqual({ id: "product-1" });
    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { slug: "shirt" },
      select: { id: true },
    });
  });

  it("groups active products by category", async () => {
    mocks.product.groupBy.mockResolvedValue([
      { category: "clothing", _count: { category: 3 } },
    ]);
    await expect(
      new PrismaProductsRepository().groupByCategory(),
    ).resolves.toEqual([{ category: "clothing", count: 3 }]);
    expect(mocks.product.groupBy).toHaveBeenCalledWith({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    });
  });

  it("maps admin product lists and prices", async () => {
    mocks.product.findMany.mockResolvedValue([product]);
    await expect(
      new PrismaProductsRepository().findManyAdmin({
        skip: 1,
        take: 5,
      } as never),
    ).resolves.toMatchObject([{ id: "product-1", price: 125000 }]);
    expect(mocks.product.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: undefined,
      skip: 1,
      take: 5,
    });
  });

  it("maps a product found by id and returns null when absent", async () => {
    mocks.product.findUnique.mockResolvedValue(product);
    await expect(
      new PrismaProductsRepository().findById("product-1"),
    ).resolves.toMatchObject({ id: "product-1", price: 125000 });
    mocks.product.findUnique.mockResolvedValue(null);
    await expect(
      new PrismaProductsRepository().findById("missing"),
    ).resolves.toBeNull();
  });

  it("creates active products and converts price", async () => {
    await expect(
      new PrismaProductsRepository().create({ name: "Shirt" } as never),
    ).resolves.toMatchObject({ id: "product-1", price: 125000 });
    expect(mocks.product.create).toHaveBeenCalledWith({
      data: { name: "Shirt", isActive: true },
    });
  });

  it("creates a product and persists aggregate events in one transaction", async () => {
    const aggregate = { id: "aggregate-1" } as never;
    const persistEvents = vi.fn().mockResolvedValue(undefined);
    await expect(
      new PrismaProductsRepository(persistEvents).createWithEvents(
        { name: "Shirt" } as never,
        aggregate,
      ),
    ).resolves.toMatchObject({ id: "product-1", price: 125000 });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(persistEvents).toHaveBeenCalledWith(
      expect.any(Object),
      [aggregate],
      new Map([["aggregate-1", 2]]),
    );
  });

  it("updates products and increments their version", async () => {
    await expect(
      new PrismaProductsRepository().update("product-1", {
        name: "New",
      } as never),
    ).resolves.toMatchObject({ price: 125000 });
    expect(mocks.product.update).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { name: "New", version: { increment: 1 } },
    });
  });

  it("updates a product and persists aggregate events transactionally", async () => {
    const aggregate = { id: "product-1" } as never;
    const persistEvents = vi.fn().mockResolvedValue(undefined);
    await expect(
      new PrismaProductsRepository(persistEvents).updateWithEvents(
        "product-1",
        { name: "New" } as never,
        aggregate,
      ),
    ).resolves.toMatchObject({ price: 125000 });
    expect(persistEvents).toHaveBeenCalledWith(
      expect.any(Object),
      [aggregate],
      new Map([["product-1", 2]]),
    );
  });

  it("changes active state and increments version", async () => {
    await expect(
      new PrismaProductsRepository().setActive("product-1", false),
    ).resolves.toMatchObject({ price: 125000 });
    expect(mocks.product.update).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { isActive: false, version: { increment: 1 } },
    });
  });

  it("changes active state and persists aggregate events transactionally", async () => {
    const aggregate = { id: "product-1" } as never;
    const persistEvents = vi.fn().mockResolvedValue(undefined);
    await expect(
      new PrismaProductsRepository(persistEvents).setActiveWithEvents(
        "product-1",
        false,
        aggregate,
      ),
    ).resolves.toMatchObject({ price: 125000 });
    expect(persistEvents).toHaveBeenCalledWith(
      expect.any(Object),
      [aggregate],
      new Map([["product-1", 2]]),
    );
  });

  it("checks whether a product exists and is active", async () => {
    mocks.product.findFirst.mockResolvedValue({ id: "product-1" });
    await expect(
      new PrismaProductsRepository().existsAndActive("product-1"),
    ).resolves.toBe(true);
    expect(mocks.product.findFirst).toHaveBeenCalledWith({
      where: { id: "product-1", isActive: true },
      select: { id: true },
    });
    mocks.product.findFirst.mockResolvedValue(null);
    await expect(
      new PrismaProductsRepository().existsAndActive("missing"),
    ).resolves.toBe(false);
  });

  it("searches full text and maps returned prices", async () => {
    mocks.queryRaw.mockResolvedValue([{ ...product, rank: 0.9 }]);
    await expect(
      new PrismaProductsRepository().searchFullText("shirt", 2, 4),
    ).resolves.toMatchObject([{ id: "product-1", price: 125000, rank: 0.9 }]);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRaw.mock.calls[0][0].join("")).toContain(
      'FROM "products"',
    );
    expect(mocks.queryRaw.mock.calls[0].slice(1)).toEqual([
      "shirt",
      "shirt",
      2,
      4,
    ]);
  });

  it("counts full-text matches and safely handles an empty aggregate result", async () => {
    mocks.queryRaw.mockResolvedValue([{ count: 7n }]);
    await expect(
      new PrismaProductsRepository().countFullTextSearch("shirt"),
    ).resolves.toBe(7);
    mocks.queryRaw.mockResolvedValue([]);
    await expect(
      new PrismaProductsRepository().countFullTextSearch("missing"),
    ).resolves.toBe(0);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });
});
