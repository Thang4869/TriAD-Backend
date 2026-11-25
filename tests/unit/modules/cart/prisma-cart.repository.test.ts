import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCartRepository } from "@modules/cart/infrastructure/repositories/prisma-cart.repository";

const mocks = vi.hoisted(() => ({
  cart: { findUnique: vi.fn(), create: vi.fn() },
  product: { findUnique: vi.fn() },
  cartItem: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    cart: mocks.cart,
    product: mocks.product,
    cartItem: mocks.cartItem,
  },
}));

const now = new Date("2026-01-01T00:00:00.000Z");
const product = {
  id: "product-1",
  name: "Shirt",
  description: "Cotton shirt",
  price: 125000,
  stock: 4,
  version: 1,
  category: "clothing",
  images: ["shirt.jpg"],
  slug: "shirt",
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const cart = {
  id: "cart-1",
  userId: "user-1",
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: "item-1",
      cartId: "cart-1",
      productId: "product-1",
      quantity: 2,
      createdAt: now,
      updatedAt: now,
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        images: product.images,
        stock: product.stock,
        slug: product.slug,
      },
    },
  ],
};
const cartItem = {
  id: "item-1",
  cartId: "cart-1",
  productId: "product-1",
  quantity: 2,
  createdAt: now,
  updatedAt: now,
  product,
};

describe("PrismaCartRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cart.findUnique.mockResolvedValue(null);
    mocks.cart.create.mockResolvedValue(cart);
    mocks.product.findUnique.mockResolvedValue(null);
    mocks.cartItem.findUnique.mockResolvedValue(null);
    mocks.cartItem.create.mockResolvedValue(cartItem);
    mocks.cartItem.update.mockResolvedValue(cartItem);
    mocks.cartItem.delete.mockResolvedValue(undefined);
    mocks.cartItem.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("loads a cart with selected product summaries and converts prices", async () => {
    mocks.cart.findUnique.mockResolvedValue(cart);
    await expect(
      new PrismaCartRepository().findCartWithItems("user-1"),
    ).resolves.toMatchObject({
      id: "cart-1",
      items: [{ product: { id: "product-1", price: 125000 } }],
    });
    expect(mocks.cart.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        include: expect.objectContaining({ items: expect.any(Object) }),
      }),
    );
  });

  it("returns null when a cart does not exist", async () => {
    await expect(
      new PrismaCartRepository().findCartWithItems("missing"),
    ).resolves.toBeNull();
  });

  it("creates a cart with selected product summaries", async () => {
    await expect(
      new PrismaCartRepository().createCartWithItems("user-1"),
    ).resolves.toMatchObject({
      id: "cart-1",
      items: [{ product: { price: 125000 } }],
    });
    expect(mocks.cart.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: "user-1" },
        include: expect.objectContaining({ items: expect.any(Object) }),
      }),
    );
  });

  it("finds and creates a cart by user id", async () => {
    mocks.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: "user-1" });
    await expect(
      new PrismaCartRepository().findCartByUserId("user-1"),
    ).resolves.toMatchObject({ id: "cart-1" });
    expect(mocks.cart.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    mocks.cart.create.mockResolvedValue({ id: "cart-2", userId: "user-2" });
    await expect(
      new PrismaCartRepository().createCart("user-2"),
    ).resolves.toMatchObject({ id: "cart-2" });
    expect(mocks.cart.create).toHaveBeenCalledWith({
      data: { userId: "user-2" },
    });
  });

  it("looks up stock information for a product", async () => {
    mocks.product.findUnique.mockResolvedValue({
      id: "product-1",
      stock: 4,
      name: "Shirt",
    });
    await expect(
      new PrismaCartRepository().findProductStockInfo("product-1"),
    ).resolves.toEqual({ id: "product-1", stock: 4, name: "Shirt" });
    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { id: "product-1" },
      select: { id: true, stock: true, name: true },
    });
  });

  it("finds a cart item by the composite key", async () => {
    mocks.cartItem.findUnique.mockResolvedValue(cartItem);
    await expect(
      new PrismaCartRepository().findCartItem("cart-1", "product-1"),
    ).resolves.toMatchObject({ id: "item-1" });
    expect(mocks.cartItem.findUnique).toHaveBeenCalledWith({
      where: { cartId_productId: { cartId: "cart-1", productId: "product-1" } },
    });
  });

  it("creates and maps a cart item with its product", async () => {
    await expect(
      new PrismaCartRepository().createCartItem("cart-1", "product-1", 2),
    ).resolves.toMatchObject({
      id: "item-1",
      product: { id: "product-1", price: 125000 },
    });
    expect(mocks.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: "cart-1", productId: "product-1", quantity: 2 },
      include: { product: true },
    });
  });

  it("updates and maps a cart item quantity", async () => {
    await expect(
      new PrismaCartRepository().updateCartItemQuantity("item-1", 3),
    ).resolves.toMatchObject({
      id: "item-1",
      quantity: 2,
      product: { price: 125000 },
    });
    expect(mocks.cartItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { quantity: 3 },
      include: { product: true },
    });
  });

  it("deletes a cart item", async () => {
    await expect(
      new PrismaCartRepository().deleteCartItem("item-1"),
    ).resolves.toBeUndefined();
    expect(mocks.cartItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    });
  });

  it("deletes all items for a cart and returns the affected count", async () => {
    mocks.cartItem.deleteMany.mockResolvedValue({ count: 3 });
    await expect(
      new PrismaCartRepository().deleteCartItemsByCartId("cart-1"),
    ).resolves.toBe(3);
    expect(mocks.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: "cart-1" },
    });
  });
});
