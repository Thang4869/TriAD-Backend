import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogService } from "@modules/products/services/catalog.service";
import { IProductsRepository } from "@modules/products/products.repository";
import { NotFoundError } from "@shared/utils/errors";

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

describe("CatalogService.findAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dùng page 1 và limit mặc định 12 khi không truyền tham số", async () => {
    const repository = createRepository();

    const result = await new CatalogService(repository).findAll({});

    expect(repository.findManyWithRatings).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 12 }),
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(12);
  });

  it("giới hạn limit tối đa 50 để tránh truy vấn quá tải", async () => {
    const repository = createRepository();

    const result = await new CatalogService(repository).findAll({ limit: 999 });

    expect(repository.findManyWithRatings).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    expect(result.limit).toBe(50);
  });

  it("tính skip đúng theo trang", async () => {
    const repository = createRepository();

    await new CatalogService(repository).findAll({ page: 3, limit: 10 });

    expect(repository.findManyWithRatings).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("luôn chỉ trả sản phẩm đang active cho trang public", async () => {
    const repository = createRepository();

    await new CatalogService(repository).findAll({});

    const query = vi.mocked(repository.findManyWithRatings).mock.calls[0][0];
    expect(JSON.stringify(query.where)).toContain('"isActive":true');
  });

  it("áp dụng filter category, khoảng giá và từ khoá vào where", async () => {
    const repository = createRepository();

    await new CatalogService(repository).findAll({
      category: "ao",
      minPrice: 10,
      maxPrice: 200,
      keyword: "thun",
    });

    const where = JSON.stringify(
      vi.mocked(repository.findManyWithRatings).mock.calls[0][0].where,
    );
    expect(where).toContain('"category":"ao"');
    expect(where).toContain('"gte":10');
    expect(where).toContain('"lte":200');
    expect(where).toContain('"contains":"thun"');
  });

  it("sắp xếp mặc định theo createdAt desc", async () => {
    const repository = createRepository();

    await new CatalogService(repository).findAll({});

    expect(repository.findManyWithRatings).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("dùng sortBy/sortOrder do client chỉ định", async () => {
    const repository = createRepository();

    await new CatalogService(repository).findAll({
      sortBy: "price",
      sortOrder: "asc",
    });

    expect(repository.findManyWithRatings).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { price: "asc" } }),
    );
  });

  it("tính avgRating/reviewCount từ reviews và loại bỏ mảng reviews khỏi list item", async () => {
    const repository = createRepository({
      findManyWithRatings: vi
        .fn()
        .mockResolvedValue([
          productRow({ reviews: [{ rating: 5 }, { rating: 4 }] }),
        ]),
      count: vi.fn().mockResolvedValue(1),
    });

    const result = await new CatalogService(repository).findAll({});

    expect(result.products[0]).toMatchObject({
      avgRating: 4.5,
      reviewCount: 2,
    });
    expect("reviews" in result.products[0]).toBe(false);
  });

  it("sản phẩm chưa có review có avgRating = 0", async () => {
    const repository = createRepository({
      findManyWithRatings: vi.fn().mockResolvedValue([productRow()]),
      count: vi.fn().mockResolvedValue(1),
    });

    const result = await new CatalogService(repository).findAll({});

    expect(result.products[0]).toMatchObject({ avgRating: 0, reviewCount: 0 });
  });

  it("totalPages làm tròn lên", async () => {
    const repository = createRepository({
      count: vi.fn().mockResolvedValue(25),
    });

    const result = await new CatalogService(repository).findAll({ limit: 10 });

    expect(result.totalPages).toBe(3);
  });

  it("không có sản phẩm nào thì totalPages = 0", async () => {
    const repository = createRepository({
      count: vi.fn().mockResolvedValue(0),
    });

    const result = await new CatalogService(repository).findAll({});

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

    const result = await new CatalogService(repository).findById("prod-1");

    expect(repository.findByIdWithReviews).toHaveBeenCalledWith("prod-1");
    expect(result.avgRating).toBe(4);
    expect(result.reviewCount).toBe(1);
    expect(result.reviews).toHaveLength(1);
  });

  it("ném NotFoundError khi không tìm thấy sản phẩm", async () => {
    const repository = createRepository();

    await expect(
      new CatalogService(repository).findById("missing"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("CatalogService.getBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tra cứu theo slug và trả chi tiết", async () => {
    const repository = createRepository({
      findBySlugWithReviews: vi.fn().mockResolvedValue(productRow()),
    });

    const result = await new CatalogService(repository).getBySlug("ao-thun");

    expect(repository.findBySlugWithReviews).toHaveBeenCalledWith("ao-thun");
    expect(result.slug).toBe("ao-thun");
  });

  it("slug không tồn tại ném NotFoundError", async () => {
    const repository = createRepository();

    await expect(
      new CatalogService(repository).getBySlug("khong-co"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("CatalogService.getCategories", () => {
  it("đổi tên field category → name cho response", async () => {
    const repository = createRepository({
      groupByCategory: vi
        .fn()
        .mockResolvedValue([{ category: "ao", count: 5 }]),
    });

    const result = await new CatalogService(repository).getCategories();

    expect(result).toEqual([{ name: "ao", count: 5 }]);
  });

  it("danh sách rỗng trả mảng rỗng", async () => {
    const result = await new CatalogService(createRepository()).getCategories();

    expect(result).toEqual([]);
  });
});

describe("CatalogService.search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("truyền skip/take đúng cho full-text search", async () => {
    const repository = createRepository();

    await new CatalogService(repository).search("áo", 2, 10);

    expect(repository.searchFullText).toHaveBeenCalledWith("áo", 10, 10);
    expect(repository.countFullTextSearch).toHaveBeenCalledWith("áo");
  });

  it("áp trần limit 50 cho search", async () => {
    const repository = createRepository();

    const result = await new CatalogService(repository).search("áo", 1, 999);

    expect(repository.searchFullText).toHaveBeenCalledWith("áo", 0, 50);
    expect(result.limit).toBe(50);
  });

  it("trả metadata phân trang đầy đủ", async () => {
    const repository = createRepository({
      searchFullText: vi.fn().mockResolvedValue([{ id: "prod-1" }]),
      countFullTextSearch: vi.fn().mockResolvedValue(11),
    });

    const result = await new CatalogService(repository).search("áo");

    expect(result).toMatchObject({
      total: 11,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    expect(result.products).toHaveLength(1);
  });
});
