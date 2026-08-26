import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Khai báo mock TRƯỚC khi jest.mock() hoisting chạy.
// Jest cho phép tham chiếu biến bắt đầu bằng "mock" bên trong factory
// của jest.mock() dù về mặt code nó nằm sau import (nhờ babel-plugin-jest-hoist).
const mockedPrisma = {
  product: {
    findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
    findMany: jest.fn<(...args: any[]) => Promise<any>>(),
    count: jest.fn<(...args: any[]) => Promise<any>>(),
    create: jest.fn<(...args: any[]) => Promise<any>>(),
    update: jest.fn<(...args: any[]) => Promise<any>>(),
    groupBy: jest.fn<(...args: any[]) => Promise<any>>(),
  },
};

jest.mock("@core/database/prisma", () => ({
  __esModule: true,
  default: mockedPrisma,
}));

import { ProductsService } from "@modules/products/products.service";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";

describe("ProductsService - Admin CRUD", () => {
  let service: ProductsService;

  const baseProduct = {
    id: "prod-1",
    name: "TriAD Storage Container",
    description: "Borosilicate glass container",
    price: 150000,
    stock: 50,
    category: "glass",
    images: ["https://cdn.example.com/img.jpg"],
    slug: "triad-storage-container",
    isActive: true,
    version: 0,
  };

  beforeEach(() => {
    service = new ProductsService();
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("tạo sản phẩm thành công khi slug chưa tồn tại", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockedPrisma.product.create.mockResolvedValueOnce(baseProduct);

      const result = await service.create({
        name: baseProduct.name,
        description: baseProduct.description,
        price: baseProduct.price,
        stock: baseProduct.stock,
        category: baseProduct.category,
        images: baseProduct.images,
        slug: baseProduct.slug,
      });

      expect(mockedPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { slug: baseProduct.slug },
        select: { id: true },
      });
      expect(mockedPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: baseProduct.slug,
          isActive: true,
        }),
      });
      expect(result).toEqual(baseProduct);
    });

    it("ném BadRequestError khi slug đã tồn tại", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce({ id: "existing-id" });

      await expect(
        service.create({
          name: baseProduct.name,
          description: baseProduct.description,
          price: baseProduct.price,
          stock: baseProduct.stock,
          category: baseProduct.category,
          images: baseProduct.images,
          slug: baseProduct.slug,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockedPrisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("ném NotFoundError khi sản phẩm không tồn tại", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update("missing-id", { price: 200000 }),
      ).rejects.toThrow(NotFoundError);

      expect(mockedPrisma.product.update).not.toHaveBeenCalled();
    });

    it("ném BadRequestError khi đổi sang slug đã bị sản phẩm khác dùng", async () => {
      mockedPrisma.product.findUnique
        .mockResolvedValueOnce(baseProduct) // tìm product theo id
        .mockResolvedValueOnce({ id: "other-product-id" }); // slug mới bị trùng

      await expect(
        service.update(baseProduct.id, { slug: "another-slug" }),
      ).rejects.toThrow(BadRequestError);

      expect(mockedPrisma.product.update).not.toHaveBeenCalled();
    });

    it("cập nhật thành công khi dữ liệu hợp lệ", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(baseProduct);
      mockedPrisma.product.update.mockResolvedValueOnce({
        ...baseProduct,
        price: 175000,
      });

      const result = await service.update(baseProduct.id, { price: 175000 });

      expect(mockedPrisma.product.update).toHaveBeenCalledWith({
        where: { id: baseProduct.id },
        data: { price: 175000 },
      });
      expect(result.price).toBe(175000);
    });

    it("không gọi kiểm tra trùng slug nếu slug không đổi", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(baseProduct);
      mockedPrisma.product.update.mockResolvedValueOnce(baseProduct);

      await service.update(baseProduct.id, { slug: baseProduct.slug });

      expect(mockedPrisma.product.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete (soft delete)", () => {
    it("ném NotFoundError khi sản phẩm không tồn tại", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(null);

      await expect(service.delete("missing-id")).rejects.toThrow(NotFoundError);
    });

    it("ném BadRequestError khi sản phẩm đã bị deactivate trước đó", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce({
        ...baseProduct,
        isActive: false,
      });

      await expect(service.delete(baseProduct.id)).rejects.toThrow(BadRequestError);
      expect(mockedPrisma.product.update).not.toHaveBeenCalled();
    });

    it("set isActive = false khi xóa thành công", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(baseProduct);
      mockedPrisma.product.update.mockResolvedValueOnce({
        ...baseProduct,
        isActive: false,
      });

      const result = await service.delete(baseProduct.id);

      expect(mockedPrisma.product.update).toHaveBeenCalledWith({
        where: { id: baseProduct.id },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe("restore", () => {
    it("ném NotFoundError khi sản phẩm không tồn tại", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(null);

      await expect(service.restore("missing-id")).rejects.toThrow(NotFoundError);
    });

    it("ném BadRequestError khi sản phẩm đang active", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce(baseProduct);

      await expect(service.restore(baseProduct.id)).rejects.toThrow(BadRequestError);
      expect(mockedPrisma.product.update).not.toHaveBeenCalled();
    });

    it("set isActive = true khi restore thành công", async () => {
      mockedPrisma.product.findUnique.mockResolvedValueOnce({
        ...baseProduct,
        isActive: false,
      });
      mockedPrisma.product.update.mockResolvedValueOnce(baseProduct);

      const result = await service.restore(baseProduct.id);

      expect(mockedPrisma.product.update).toHaveBeenCalledWith({
        where: { id: baseProduct.id },
        data: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe("adminFindAll", () => {
    it("áp filter isActive khi được truyền vào, và không ép isActive:true như findAll public", async () => {
      mockedPrisma.product.findMany.mockResolvedValueOnce([baseProduct]);
      mockedPrisma.product.count.mockResolvedValueOnce(1);

      await service.adminFindAll({ isActive: false, page: 1, limit: 20 });

      expect(mockedPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it("không áp filter isActive khi không truyền (thấy cả active và inactive)", async () => {
      mockedPrisma.product.findMany.mockResolvedValueOnce([baseProduct]);
      mockedPrisma.product.count.mockResolvedValueOnce(1);

      await service.adminFindAll({ page: 1, limit: 20 });

      const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("isActive");
    });

    it("giới hạn limit tối đa 50 kể cả khi client truyền cao hơn", async () => {
      mockedPrisma.product.findMany.mockResolvedValueOnce([]);
      mockedPrisma.product.count.mockResolvedValueOnce(0);

      const result = await service.adminFindAll({ page: 1, limit: 999 });

      expect(result.limit).toBe(50);
      expect(mockedPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });
});