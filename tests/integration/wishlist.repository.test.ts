import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaWishlistRepository } from "@modules/wishlist/wishlist.repository";

describe("PrismaWishlistRepository (integration, real DB)", () => {
  const repository = new PrismaWishlistRepository();
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `wishlist-repo-${Date.now()}@test.com`,
        password: "hashed",
        firstName: "Repo",
        lastName: "Test",
        isVerified: true,
      },
    });
    userId = user.id;

    const product = await prisma.product.create({
      data: {
        name: "Repo Test Product",
        description: "test",
        price: 100,
        stock: 10,
        category: "test",
        slug: `repo-test-${Date.now()}`,
        images: [],
      },
    });
    productId = product.id;
  });

  it("create() lưu đúng userId/productId và trả kèm thông tin product", async () => {
    const item = await repository.create(userId, productId);

    expect(item.userId).toBe(userId);
    expect(item.productId).toBe(productId);
    expect(item.product.id).toBe(productId);
  });

  it("exists() trả false trước khi thêm, true sau khi thêm", async () => {
    await expect(repository.exists(userId, productId)).resolves.toBe(false);

    await repository.create(userId, productId);

    await expect(repository.exists(userId, productId)).resolves.toBe(true);
  });

  it("create() ném lỗi Prisma khi thêm trùng (@@unique([userId, productId]) chặn ở tầng DB)", async () => {
    await repository.create(userId, productId);

    await expect(repository.create(userId, productId)).rejects.toThrow();
  });

  it("delete() xoá đúng bản ghi, không ảnh hưởng wishlist của user khác", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `wishlist-other-${Date.now()}@test.com`,
        password: "hashed",
        firstName: "Other",
        lastName: "User",
        isVerified: true,
      },
    });

    await repository.create(userId, productId);
    await repository.create(otherUser.id, productId);

    await repository.delete(userId, productId);

    await expect(repository.exists(userId, productId)).resolves.toBe(false);
    await expect(repository.exists(otherUser.id, productId)).resolves.toBe(
      true,
    );
  });

  it("findByUser() sắp xếp mới nhất trước (orderBy createdAt desc)", async () => {
    const productB = await prisma.product.create({
      data: {
        name: "Repo Test Product B",
        description: "test",
        price: 200,
        stock: 5,
        category: "test",
        slug: `repo-test-b-${Date.now()}`,
        images: [],
      },
    });

    await repository.create(userId, productId);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await repository.create(userId, productB.id);

    const items = await repository.findByUser(userId, 0, 10);

    expect(items[0].productId).toBe(productB.id);
    expect(items[1].productId).toBe(productId);
  });

  it("productExists() phân biệt đúng product tồn tại và không tồn tại", async () => {
    await expect(repository.productExists(productId)).resolves.toBe(true);
    await expect(
      repository.productExists("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBe(false);
  });

  it("countByUser returns correct count", async () => {
    await repository.create(userId, productId);
    const count = await repository.countByUser(userId);
    expect(count).toBe(1);
  });
});
