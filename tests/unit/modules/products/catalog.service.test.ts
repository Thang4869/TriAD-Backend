import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogService } from "@modules/products/services/catalog.service";
import type { IProductsRepository } from "@modules/products/application/ports/products.repository.port";
import { NotFoundError } from "@shared/utils/errors";
import type { ProductCatalogReadPort } from "@modules/products/application/product-catalog-read.port";
function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Áo thun",
    description: "Mô tả",
    price: 100_000,
    stock: 10,
    category: "ao",
    images: [],
    slug: "ao-thun",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    reviews: [],
    ...overrides,
  };
}

function createRepository(
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
    existsAndActive: vi.fn().mockResolvedValue(true),
    searchFullText: vi.fn().mockResolvedValue([]),
    countFullTextSearch: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as IProductsRepository;
}

function createCatalogRead(
  overrides: Partial<ProductCatalogReadPort> = {},
): ProductCatalogReadPort {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    groupByCategory: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    countSearch: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function createService(
  catalogRead = createCatalogRead(),
  detailRead = createRepository(),
) {
  return new CatalogService(catalogRead, detailRead);
}

describe("CatalogService.findAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dùng page 1 và limit mặc định 12 khi không truyền tham số", async () => {
    const repository = createCatalogRead();

    const result = await createService(repository).findAll({});

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 12 }),
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(12);
  });

  it("giới hạn limit tối đa 50 để tránh truy vấn quá tải", async () => {
    const repository = createCatalogRead();

    const result = await createService(repository).findAll({ limit: 999 });

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    expect(result.limit).toBe(50);
  });

  it("tính skip đúng theo trang", async () => {
    const repository = createCatalogRead();

    await createService(repository).findAll({ page: 3, limit: 10 });

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("luôn chỉ trả sản phẩm đang active cho trang public", async () => {
    const repository = createCatalogRead();

    await createService(repository).findAll({});

    const query = vi.mocked(repository.findMany).mock.calls[0][0];
    expect(JSON.stringify(query.where)).toContain('"isActive":true');
  });

  it("áp dụng filter category, khoảng giá và từ khoá vào where", async () => {
    const repository = createCatalogRead();

    await createService(repository).findAll({
      category: "ao",
      minPrice: 10,
      maxPrice: 200,
      keyword: "thun",
    });

    const where = JSON.stringify(
      vi.mocked(repository.findMany).mock.calls[0][0].where,
    );
    expect(where).toContain('"category":"ao"');
    expect(where).toContain('"gte":10');
    expect(where).toContain('"lte":200');
    expect(where).toContain('"contains":"thun"');
  });

  it("sắp xếp mặc định theo createdAt desc", async () => {
    const repository = createCatalogRead();

    await createService(repository).findAll({});

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("dùng sortBy/sortOrder do client chỉ định", async () => {
    const repository = createCatalogRead();

    await createService(repository).findAll({
      sortBy: "price",
      sortOrder: "asc",
    });

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { price: "asc" } }),
    );
  });

  it("trả avgRating/reviewCount từ catalog projection", async () => {
    const repository = createCatalogRead({
      findMany: vi.fn().mockResolvedValue([
        productRow({
          avgRating: 4.5,
          reviewCount: 2,
          reviews: undefined,
        }),
      ]),
      count: vi.fn().mockResolvedValue(1),
    });

    const result = await createService(repository).findAll({});

    expect(result.products[0]).toMatchObject({
      avgRating: 4.5,
      reviewCount: 2,
    });
    expect("reviews" in result.products[0]).toBe(false);
  });

  it("projection chưa có review có avgRating = 0", async () => {
    const repository = createCatalogRead({
      findMany: vi.fn().mockResolvedValue([
        productRow({
          avgRating: 0,
          reviewCount: 0,
          reviews: undefined,
        }),
      ]),
      count: vi.fn().mockResolvedValue(1),
    });

    const result = await createService(repository).findAll({});

    expect(result.products[0]).toMatchObject({
      avgRating: 0,
      reviewCount: 0,
    });
  });

  it("totalPages làm tròn lên", async () => {
    const repository = createCatalogRead({
      count: vi.fn().mockResolvedValue(25),
    });

    const result = await createService(repository).findAll({ limit: 10 });

    expect(result.totalPages).toBe(3);
  });

  it("không có sản phẩm nào thì totalPages = 0", async () => {
    const repository = createCatalogRead({
      count: vi.fn().mockResolvedValue(0),
    });

    const result = await createService(repository).findAll({});

    expect(result.totalPages).toBe(0);
    expect(result.products).toEqual([]);
  });
});

describe("CatalogService.findById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả chi tiết kèm reviews và điểm trung bình", async () => {
    const repository = createRepository({
      findByIdWithReviews: vi.fn().mockResolvedValue(
        productRow({
          reviews: [
            {
              id: "r1",
              rating: 4,
              comment: null,
              createdAt: new Date(),
              user: { id: "u1", firstName: "A", lastName: "B" },
            },
          ],
        }),
      ),
    });

    const result = await createService(
      createCatalogRead(),
      repository,
    ).findById("prod-1");

    expect(repository.findByIdWithReviews).toHaveBeenCalledWith("prod-1");
    expect(result.avgRating).toBe(4);
    expect(result.reviewCount).toBe(1);
    expect(result.reviews).toHaveLength(1);
  });

  it("ném NotFoundError khi không tìm thấy sản phẩm", async () => {
    const detailRead = createRepository({
      findByIdWithReviews: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(createCatalogRead(), detailRead).findById("missing"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("CatalogService.getBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tra cứu theo slug và trả chi tiết", async () => {
    const repository = createRepository({
      findBySlugWithReviews: vi.fn().mockResolvedValue(productRow()),
    });

    const result = await createService(
      createCatalogRead(),
      repository,
    ).getBySlug("ao-thun");

    expect(repository.findBySlugWithReviews).toHaveBeenCalledWith("ao-thun");
    expect(result.slug).toBe("ao-thun");
  });

  it("slug không tồn tại ném NotFoundError", async () => {
    const detailRead = createRepository({
      findBySlugWithReviews: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(createCatalogRead(), detailRead).getBySlug("khong-co"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("CatalogService.getCategories", () => {
  it("đổi tên field category → name cho response", async () => {
    const repository = createCatalogRead({
      groupByCategory: vi
        .fn()
        .mockResolvedValue([{ category: "ao", count: 5 }]),
    });

    const result = await createService(repository).getCategories();

    expect(result).toEqual([{ name: "ao", count: 5 }]);
  });

  it("danh sách rỗng trả mảng rỗng", async () => {
    const result = await createService(createCatalogRead()).getCategories();

    expect(result).toEqual([]);
  });
});

describe("CatalogService.search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("truyền skip/take đúng cho full-text search", async () => {
    const repository = createCatalogRead();

    await createService(repository).search("áo", 2, 10);

    expect(repository.search).toHaveBeenCalledWith("áo", 10, 10);
    expect(repository.countSearch).toHaveBeenCalledWith("áo");
  });

  it("áp trần limit 50 cho search", async () => {
    const repository = createCatalogRead();

    const result = await createService(repository).search("áo", 1, 999);

    expect(repository.search).toHaveBeenCalledWith("áo", 0, 50);
    expect(result.limit).toBe(50);
  });

  it("trả metadata phân trang đầy đủ", async () => {
    const repository = createCatalogRead({
      search: vi.fn().mockResolvedValue([
        productRow({
          avgRating: 0,
          reviewCount: 0,
          reviews: undefined,
        }),
      ]),
      countSearch: vi.fn().mockResolvedValue(11),
    });

    const result = await createService(repository).search("áo");

    expect(result).toMatchObject({
      total: 11,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    expect(result.products).toHaveLength(1);
  });
});
