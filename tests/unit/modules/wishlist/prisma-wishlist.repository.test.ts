import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaWishlistRepository } from "@modules/wishlist/infrastructure/repositories/prisma-wishlist.repository";

const mocks = vi.hoisted(() => ({
  wishlistItem: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  product: { findUnique: vi.fn() },
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    wishlistItem: mocks.wishlistItem,
    product: mocks.product,
  },
}));

const item = {
  id: "wishlist-1",
  userId: "user-1",
  productId: "product-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  product: {
    id: "product-1",
    name: "Shirt",
    price: 125000,
    images: ["shirt.jpg"],
    stock: 4,
    slug: "shirt",
    isActive: true,
  },
};

describe("PrismaWishlistRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wishlistItem.findMany.mockResolvedValue([]);
    mocks.wishlistItem.count.mockResolvedValue(0);
    mocks.wishlistItem.findUnique.mockResolvedValue(null);
    mocks.wishlistItem.create.mockResolvedValue(item);
    mocks.wishlistItem.delete.mockResolvedValue(item);
    mocks.product.findUnique.mockResolvedValue(null);
  });

  it("lists a user's wishlist with pagination and safe numeric prices", async () => {
    mocks.wishlistItem.findMany.mockResolvedValue([item]);

    await expect(
      new PrismaWishlistRepository().findByUser("user-1", 10, 5),
    ).resolves.toEqual([
      { ...item, product: { ...item.product, price: 125000 } },
    ]);

    expect(mocks.wishlistItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            images: true,
            stock: true,
            slug: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 5,
    });
  });

  it("returns an empty list when the user has no wishlist items", async () => {
    await expect(
      new PrismaWishlistRepository().findByUser("user-1", 0, 20),
    ).resolves.toEqual([]);
  });

  it("counts wishlist items for a user", async () => {
    mocks.wishlistItem.count.mockResolvedValue(3);

    await expect(
      new PrismaWishlistRepository().countByUser("user-1"),
    ).resolves.toBe(3);

    expect(mocks.wishlistItem.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("returns true when a wishlist item exists", async () => {
    mocks.wishlistItem.findUnique.mockResolvedValue({ id: "wishlist-1" });

    await expect(
      new PrismaWishlistRepository().exists("user-1", "product-1"),
    ).resolves.toBe(true);

    expect(mocks.wishlistItem.findUnique).toHaveBeenCalledWith({
      where: { userId_productId: { userId: "user-1", productId: "product-1" } },
      select: { id: true },
    });
  });

  it("returns false when a wishlist item does not exist", async () => {
    await expect(
      new PrismaWishlistRepository().exists("user-1", "missing"),
    ).resolves.toBe(false);
  });

  it("returns true when the product exists", async () => {
    mocks.product.findUnique.mockResolvedValue({ id: "product-1" });

    await expect(
      new PrismaWishlistRepository().productExists("product-1"),
    ).resolves.toBe(true);

    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { id: "product-1" },
      select: { id: true },
    });
  });

  it("returns false when the product does not exist", async () => {
    await expect(
      new PrismaWishlistRepository().productExists("missing"),
    ).resolves.toBe(false);
  });

  it("creates a wishlist item and converts the related product price", async () => {
    mocks.wishlistItem.create.mockResolvedValue(item);

    await expect(
      new PrismaWishlistRepository().create("user-1", "product-1"),
    ).resolves.toEqual(
      [{ ...item, product: { ...item.product, price: 125000 } }][0],
    );

    expect(mocks.wishlistItem.create).toHaveBeenCalledWith({
      data: { userId: "user-1", productId: "product-1" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            images: true,
            stock: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });
  });

  it("deletes an item using the compound user and product key", async () => {
    await expect(
      new PrismaWishlistRepository().delete("user-1", "product-1"),
    ).resolves.toBeUndefined();

    expect(mocks.wishlistItem.delete).toHaveBeenCalledWith({
      where: { userId_productId: { userId: "user-1", productId: "product-1" } },
    });
  });
});
