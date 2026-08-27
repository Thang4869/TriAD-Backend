import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProductsService } from "@modules/products/products.service";
import { IProductsRepository } from "@modules/products/products.repository";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";

function createFakeRepository(
  overrides: Partial<IProductsRepository> = {},
): IProductsRepository {
  return {
    findManyWithRatings: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findByIdWithReviews: vi.fn().mockResolvedValue(null),
    findBySlugWithReviews: vi.fn().mockResolvedValue(null),
    findBySlugId: vi.fn().mockResolvedValue(null),
    groupByCategory: vi.fn().mockResolvedValue([]),
    findManyAdmin: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    ...overrides,
  };
}

describe("ProductsService - Admin CRUD", () => {
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

  describe("create", () => {
    it("tạo sản phẩm thành công khi slug chưa tồn tại", async () => {
      const repository = createFakeRepository({
        findBySlugId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(baseProduct),
      });
      const service = new ProductsService(repository);

      const result = await service.create({
        name: baseProduct.name,
        description: baseProduct.description,
        price: baseProduct.price,
        stock: baseProduct.stock,
        category: baseProduct.category,
        images: baseProduct.images,
        slug: baseProduct.slug,
      });

      expect(repository.findBySlugId).toHaveBeenCalledWith(baseProduct.slug);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: baseProduct.slug }),
      );
      expect(result).toEqual(baseProduct);
    });

    it("ném BadRequestError khi slug đã tồn tại", async () => {
      const repository = createFakeRepository({
        findBySlugId: vi.fn().mockResolvedValue({ id: "existing-id" }),
      });
      const service = new ProductsService(repository);

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
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("findById", () => {
    it("ném NotFoundError khi sản phẩm không tồn tại", async () => {
      const repository = createFakeRepository({
        findByIdWithReviews: vi.fn().mockResolvedValue(null),
      });
      const service = new ProductsService(repository);

      await expect(service.findById("missing-id")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("tính avgRating chính xác từ danh sách reviews", async () => {
      const repository = createFakeRepository({
        findByIdWithReviews: vi.fn().mockResolvedValue({
          ...baseProduct,
          reviews: [{ rating: 4 }, { rating: 5 }, { rating: 3 }],
        } as any),
      });
      const service = new ProductsService(repository);

      const result: any = await service.findById(baseProduct.id);

      expect(result.avgRating).toBe(4);
      expect(result.reviewCount).toBe(3);
    });
  });
});