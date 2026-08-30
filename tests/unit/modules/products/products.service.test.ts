import { describe, it, expect, vi } from "vitest";
import { ProductsService } from "@modules/products/products.service";
import { IProductsRepository } from "@modules/products/products.repository";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import { imageQueue } from "@core/queue/bull";

vi.mock("@core/queue/bull", () => ({
  imageQueue: { add: vi.fn().mockResolvedValue({}) },
}));

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
    existsAndActive: vi.fn().mockResolvedValue(true),
    searchFullText: vi.fn().mockResolvedValue([]),
    countFullTextSearch: vi.fn().mockResolvedValue(0),
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

    it("trả avgRating = 0 khi sản phẩm chưa có review nào", async () => {
      const repository = createFakeRepository({
        findByIdWithReviews: vi.fn().mockResolvedValue({
          ...baseProduct,
          reviews: [],
        } as any),
      });
      const service = new ProductsService(repository);

      const result: any = await service.findById(baseProduct.id);

      expect(result.avgRating).toBe(0);
      expect(result.reviewCount).toBe(0);
    });
  });

  describe("ProductsService - findAll", () => {
    it("applies category filter", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.findAll({ category: "glass" });
      expect(repository.findManyWithRatings).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: "glass" }),
        }),
      );
    });

    it("applies price range", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.findAll({ minPrice: 100, maxPrice: 200 });
      expect(repository.findManyWithRatings).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { gte: 100, lte: 200 },
          }),
        }),
      );
    });

    it("applies keyword search", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.findAll({ keyword: "container" });
      expect(repository.findManyWithRatings).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: "container", mode: "insensitive" } },
              { description: { contains: "container", mode: "insensitive" } },
            ],
          }),
        }),
      );
    });

    it("sorts by given field", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.findAll({ sortBy: "price", sortOrder: "asc" });
      expect(repository.findManyWithRatings).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { price: "asc" },
        }),
      );
    });
  });

  describe("ProductsService - getBySlug", () => {
    it("throws if product not found", async () => {
      const repository = createFakeRepository({
        findBySlugWithReviews: vi.fn().mockResolvedValue(null),
      });
      const service = new ProductsService(repository);
      await expect(service.getBySlug("missing")).rejects.toThrow(NotFoundError);
    });

    it("returns product detail with avgRating", async () => {
      const product = {
        ...baseProduct,
        reviews: [{ rating: 4 }, { rating: 5 }],
      };
      const repository = createFakeRepository({
        findBySlugWithReviews: vi.fn().mockResolvedValue(product),
      });
      const service = new ProductsService(repository);
      const result: any = await service.getBySlug("slug");
      expect(result.avgRating).toBe(4.5);
      expect(result.reviewCount).toBe(2);
    });
  });

  describe("ProductsService - getCategories", () => {
    it("returns categories with counts", async () => {
      const repository = createFakeRepository({
        groupByCategory: vi.fn().mockResolvedValue([
          { category: "glass", count: 5 },
          { category: "metal", count: 3 },
        ]),
      });
      const service = new ProductsService(repository);
      const result = await service.getCategories();
      expect(result).toEqual([
        { name: "glass", count: 5 },
        { name: "metal", count: 3 },
      ]);
    });
  });

  describe("ProductsService - adminFindAll", () => {
    it("filters by isActive", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.adminFindAll({ isActive: false });
      expect(repository.findManyAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it("filters by category", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.adminFindAll({ category: "glass" });
      expect(repository.findManyAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: "glass" }),
        }),
      );
    });

    it("filters by keyword across name and description", async () => {
      const repository = createFakeRepository();
      const service = new ProductsService(repository);
      await service.adminFindAll({ keyword: "container" });
      expect(repository.findManyAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: "container", mode: "insensitive" } },
              { description: { contains: "container", mode: "insensitive" } },
            ],
          }),
        }),
      );
    });
  });

  describe("ProductsService - update", () => {
    it("throws NotFoundError if product does not exist", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = new ProductsService(repository);

      await expect(
        service.update("missing-id", { price: 99 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("updates without slug check when slug is unchanged", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseProduct),
        update: vi.fn().mockResolvedValue({ ...baseProduct, price: 200 }),
      });
      const service = new ProductsService(repository);

      const result = await service.update("prod-1", { price: 200 });

      expect(repository.findBySlugId).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith("prod-1", {
        price: 200,
      });
      expect(result).toMatchObject({ price: 200 });
    });

    it("throws BadRequestError when the new slug is already taken by another product", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseProduct),
        findBySlugId: vi.fn().mockResolvedValue({ id: "other-product" }),
      });
      const service = new ProductsService(repository);

      await expect(
        service.update("prod-1", { slug: "new-slug" }),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("updates successfully when the new slug is free", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseProduct),
        findBySlugId: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({ ...baseProduct, slug: "new-slug" }),
      });
      const service = new ProductsService(repository);

      const result = await service.update("prod-1", { slug: "new-slug" });

      expect(repository.findBySlugId).toHaveBeenCalledWith("new-slug");
      expect(repository.update).toHaveBeenCalledWith("prod-1", {
        slug: "new-slug",
      });
      expect(result).toMatchObject({ slug: "new-slug" });
    });
  });

  describe("ProductsService - delete", () => {
    it("throws NotFoundError if product does not exist", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = new ProductsService(repository);
      await expect(service.delete("missing-id")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repository.setActive).not.toHaveBeenCalled();
    });

    it("throws if product already inactive", async () => {
      const repository = createFakeRepository({
        findById: vi
          .fn()
          .mockResolvedValue({ ...baseProduct, isActive: false }),
      });
      const service = new ProductsService(repository);
      await expect(service.delete("prod-1")).rejects.toThrow(BadRequestError);
    });

    it("deactivates an active product", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue({ ...baseProduct, isActive: true }),
        setActive: vi
          .fn()
          .mockResolvedValue({ ...baseProduct, isActive: false }),
      });
      const service = new ProductsService(repository);

      const result = await service.delete("prod-1");

      expect(repository.setActive).toHaveBeenCalledWith("prod-1", false);
      expect(result).toMatchObject({ isActive: false });
    });
  });

  describe("ProductsService - restore", () => {
    it("throws NotFoundError if product does not exist", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = new ProductsService(repository);
      await expect(service.restore("missing-id")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repository.setActive).not.toHaveBeenCalled();
    });

    it("throws if product already active", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue({ ...baseProduct, isActive: true }),
      });
      const service = new ProductsService(repository);
      await expect(service.restore("prod-1")).rejects.toThrow(BadRequestError);
    });

    it("reactivates an inactive product", async () => {
      const repository = createFakeRepository({
        findById: vi
          .fn()
          .mockResolvedValue({ ...baseProduct, isActive: false }),
        setActive: vi
          .fn()
          .mockResolvedValue({ ...baseProduct, isActive: true }),
      });
      const service = new ProductsService(repository);

      const result = await service.restore("prod-1");

      expect(repository.setActive).toHaveBeenCalledWith("prod-1", true);
      expect(result).toMatchObject({ isActive: true });
    });
  });

  describe("ProductsService - uploadImage", () => {
    it("throws NotFoundError when the product does not exist or is inactive", async () => {
      const repository = createFakeRepository({
        existsAndActive: vi.fn().mockResolvedValue(false),
      });
      const service = new ProductsService(repository);

      await expect(
        service.uploadImage("missing-id", "/tmp/upload.png"),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(imageQueue.add).not.toHaveBeenCalled();
    });

    it("enqueues an image-processing job and returns queued:true", async () => {
      const repository = createFakeRepository({
        existsAndActive: vi.fn().mockResolvedValue(true),
      });
      const service = new ProductsService(repository);

      const result = await service.uploadImage("prod-1", "/tmp/upload.png");

      expect(imageQueue.add).toHaveBeenCalledWith("process-product-image", {
        productId: "prod-1",
        localFilePath: "/tmp/upload.png",
      });
      expect(result).toEqual({ queued: true });
    });
  });

  describe("ProductsService - search", () => {
    it("returns full-text search results", async () => {
      const repository = createFakeRepository({
        searchFullText: vi
          .fn()
          .mockResolvedValue([{ id: "p1", name: "Glass" }]),
        countFullTextSearch: vi.fn().mockResolvedValue(1),
      });
      const service = new ProductsService(repository);
      const result = await service.search("glass");
      expect(result.products).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
