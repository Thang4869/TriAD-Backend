import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductsService } from '@modules/products/products.service';
import { NotFoundError, BadRequestError } from '@shared/utils/errors';

vi.mock('@core/database/prisma', () => ({
  default: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import prisma from '@core/database/prisma';

describe('ProductsService - Admin CRUD', () => {
  let service: ProductsService;

  const baseProduct = {
    id: 'prod-1',
    name: 'TriAD Storage Container',
    description: 'Borosilicate glass container',
    price: 150000,
    stock: 50,
    category: 'glass',
    images: ['https://cdn.example.com/img.jpg'],
    slug: 'triad-storage-container',
    isActive: true,
    version: 0,
  };

  beforeEach(() => {
    service = new ProductsService();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('tạo sản phẩm thành công khi slug chưa tồn tại', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(null);
      (prisma.product.create as any).mockResolvedValueOnce(baseProduct);

      const result = await service.create({
        name: baseProduct.name,
        description: baseProduct.description,
        price: baseProduct.price,
        stock: baseProduct.stock,
        category: baseProduct.category,
        images: baseProduct.images,
        slug: baseProduct.slug,
      });

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { slug: baseProduct.slug },
        select: { id: true },
      });
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: baseProduct.slug,
          isActive: true,
        }),
      });
      expect(result).toEqual(baseProduct);
    });

    it('ném BadRequestError khi slug đã tồn tại', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce({ id: 'existing-id' });

      await expect(
        service.create({
          name: baseProduct.name,
          description: baseProduct.description,
          price: baseProduct.price,
          stock: baseProduct.stock,
          category: baseProduct.category,
          images: baseProduct.images,
          slug: baseProduct.slug,
        })
      ).rejects.toThrow(BadRequestError);

      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundError khi sản phẩm không tồn tại', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(null);

      await expect(service.update('missing-id', { price: 200000 })).rejects.toThrow(NotFoundError);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestError khi đổi sang slug đã bị sản phẩm khác dùng', async () => {
      (prisma.product.findUnique as any)
        .mockResolvedValueOnce(baseProduct)
        .mockResolvedValueOnce({ id: 'other-product-id' });

      await expect(service.update(baseProduct.id, { slug: 'another-slug' })).rejects.toThrow(BadRequestError);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('cập nhật thành công khi dữ liệu hợp lệ', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(baseProduct);
      (prisma.product.update as any).mockResolvedValueOnce({ ...baseProduct, price: 175000, version: 1 });

      const result = await service.update(baseProduct.id, { price: 175000 });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: baseProduct.id },
        data: { price: 175000 },
      });
      expect(result.price).toBe(175000);
    });

    it('không gọi kiểm tra trùng slug nếu slug không đổi', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(baseProduct);
      (prisma.product.update as any).mockResolvedValueOnce(baseProduct);

      await service.update(baseProduct.id, { slug: baseProduct.slug });
      expect(prisma.product.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete (soft delete)', () => {
    it('ném NotFoundError khi sản phẩm không tồn tại', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(null);
      await expect(service.delete('missing-id')).rejects.toThrow(NotFoundError);
    });

    it('ném BadRequestError khi sản phẩm đã bị deactivate trước đó', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce({ ...baseProduct, isActive: false });
      await expect(service.delete(baseProduct.id)).rejects.toThrow(BadRequestError);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('set isActive = false khi xóa thành công', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(baseProduct);
      (prisma.product.update as any).mockResolvedValueOnce({ ...baseProduct, isActive: false });

      const result = await service.delete(baseProduct.id);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: baseProduct.id },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe('restore', () => {
    it('ném NotFoundError khi sản phẩm không tồn tại', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(null);
      await expect(service.restore('missing-id')).rejects.toThrow(NotFoundError);
    });

    it('ném BadRequestError khi sản phẩm đang active', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce(baseProduct);
      await expect(service.restore(baseProduct.id)).rejects.toThrow(BadRequestError);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('set isActive = true khi restore thành công', async () => {
      (prisma.product.findUnique as any).mockResolvedValueOnce({ ...baseProduct,isActive: false, });
      (prisma.product.update as any).mockResolvedValueOnce(baseProduct);

      const result = await service.restore(baseProduct.id);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: baseProduct.id },
        data: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe('adminFindAll', () => {
    it('áp filter isActive khi được truyền vào', async () => {
      (prisma.product.findMany as any).mockResolvedValueOnce([baseProduct]);
      (prisma.product.count as any).mockResolvedValueOnce(1);

      await service.adminFindAll({ isActive: false, page: 1, limit: 20 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('không áp filter isActive khi không truyền', async () => {
      (prisma.product.findMany as any).mockResolvedValueOnce([baseProduct]);
      (prisma.product.count as any).mockResolvedValueOnce(1);

      await service.adminFindAll({ page: 1, limit: 20 });

      const callArgs = (prisma.product.findMany as any).mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('isActive');
    });

    it('giới hạn limit tối đa 50', async () => {
      (prisma.product.findMany as any).mockResolvedValueOnce([]);
      (prisma.product.count as any).mockResolvedValueOnce(0);

      const result = await service.adminFindAll({ page: 1, limit: 999 });
      expect(result.limit).toBe(50);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });
  });
});