import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaCartRepository } from "@modules/cart/cart.repository";

describe("PrismaCartRepository (integration)", () => {
  const repository = new PrismaCartRepository();
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `cart-repo-${Date.now()}@test.com`,
        password: "h",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        name: "Cart Product",
        description: "d",
        price: 50,
        stock: 20,
        category: "c",
        slug: `cart-p-${Date.now()}`,
        images: [],
      },
    });
    productId = product.id;
  });

  it("createCart + findCartByUserId hoạt động đúng", async () => {
    await repository.createCart(userId);
    await expect(repository.findCartByUserId(userId)).resolves.toMatchObject({
      userId,
    });
  });

  it("findCartWithItems trả null khi user chưa có cart", async () => {
    await expect(repository.findCartWithItems(userId)).resolves.toBeNull();
  });

  it("createCartItem + findCartItem trả về đúng item kèm thông tin product", async () => {
    const cart = await repository.createCart(userId);

    const item = await repository.createCartItem(cart.id, productId, 3);

    expect(item.quantity).toBe(3);
    expect(item.product.id).toBe(productId);
    await expect(
      repository.findCartItem(cart.id, productId),
    ).resolves.toMatchObject({
      id: item.id,
    });
  });

  it("updateCartItemQuantity cập nhật đúng số lượng", async () => {
    const cart = await repository.createCart(userId);
    const item = await repository.createCartItem(cart.id, productId, 1);

    const updated = await repository.updateCartItemQuantity(item.id, 5);

    expect(updated.quantity).toBe(5);
  });

  it("deleteCartItem xoá đúng item", async () => {
    const cart = await repository.createCart(userId);
    const item = await repository.createCartItem(cart.id, productId, 1);

    await repository.deleteCartItem(item.id);

    await expect(
      repository.findCartItem(cart.id, productId),
    ).resolves.toBeNull();
  });

  it("deleteCartItemsByCartId trả về đúng count đã xoá", async () => {
    const cart = await repository.createCart(userId);
    await repository.createCartItem(cart.id, productId, 1);

    const count = await repository.deleteCartItemsByCartId(cart.id);

    expect(count).toBe(1);
  });

  it("findProductStockInfo trả đúng stock hiện tại", async () => {
    const info = await repository.findProductStockInfo(productId);
    expect(info?.stock).toBe(20);
  });

  it("createCartWithItems tạo cart mới và trả về kèm mảng items rỗng", async () => {
    const cart = await repository.createCartWithItems(userId);

    expect(cart.userId).toBe(userId);
    expect(cart.items).toEqual([]);

    const persisted = await prisma.cart.findUnique({ where: { userId } });
    expect(persisted).not.toBeNull();
  });

  it("findCartWithItems returns cart with product details", async () => {
    const cart = await repository.createCart(userId);
    await repository.createCartItem(cart.id, productId, 3);
    const result = await repository.findCartWithItems(userId);
    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].product).toHaveProperty("name", "Cart Product");
  });
});
