import { describe, it, expect, vi, beforeEach } from "vitest";
import { WishlistService } from "@modules/wishlist/wishlist.service";
import type { IWishlistRepository } from "@modules/wishlist/application/ports/wishlist.repository.port";
import {
  ResourceNotFoundError,
  ValidationError,
} from "@shared/errors/application-error";

function createFakeRepository(
  overrides: Partial<IWishlistRepository> = {},
): IWishlistRepository {
  return {
    findByUser: vi.fn().mockResolvedValue([]),
    countByUser: vi.fn().mockResolvedValue(0),
    exists: vi.fn().mockResolvedValue(false),
    productExists: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe("WishlistService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("addItem", () => {
    it("ném ResourceNotFoundError khi product không tồn tại", async () => {
      const repository = createFakeRepository({
        productExists: vi.fn().mockResolvedValue(false),
      });
      const service = new WishlistService(repository);

      await expect(
        service.addItem("user-1", "product-x"),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(repository.exists).not.toHaveBeenCalled();
    });

    it("ném ValidationError khi product đã có trong wishlist", async () => {
      const repository = createFakeRepository({
        productExists: vi.fn().mockResolvedValue(true),
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = new WishlistService(repository);

      await expect(
        service.addItem("user-1", "product-1"),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("thêm thành công khi product tồn tại và chưa nằm trong wishlist", async () => {
      const repository = createFakeRepository({
        productExists: vi.fn().mockResolvedValue(true),
        exists: vi.fn().mockResolvedValue(false),
        create: vi.fn().mockResolvedValue({
          id: "w1",
          userId: "user-1",
          productId: "product-1",
        }),
      });
      const service = new WishlistService(repository);

      const result = await service.addItem("user-1", "product-1");

      expect(repository.create).toHaveBeenCalledWith("user-1", "product-1");
      expect(result).toMatchObject({ id: "w1" });
    });
  });

  describe("removeItem", () => {
    it("ném ResourceNotFoundError khi item không có trong wishlist", async () => {
      const repository = createFakeRepository({
        exists: vi.fn().mockResolvedValue(false),
      });
      const service = new WishlistService(repository);

      await expect(
        service.removeItem("user-1", "product-1"),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it("xoá thành công khi item tồn tại", async () => {
      const repository = createFakeRepository({
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = new WishlistService(repository);

      await service.removeItem("user-1", "product-1");

      expect(repository.delete).toHaveBeenCalledWith("user-1", "product-1");
    });
  });

  describe("getWishlist", () => {
    it("tính đúng skip/totalPages theo trang truyền vào", async () => {
      const repository = createFakeRepository({
        countByUser: vi.fn().mockResolvedValue(45),
      });
      const service = new WishlistService(repository);

      const result = await service.getWishlist("user-1", 3, 20);

      expect(repository.findByUser).toHaveBeenCalledWith("user-1", 40, 20);
      expect(result).toMatchObject({ total: 45, totalPages: 3 });
    });
  });
});
