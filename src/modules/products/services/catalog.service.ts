import { ResourceNotFoundError } from "@shared/errors/application-error";
import { Rating } from "@shared/value-objects/rating";
import {
  ProductCatalogReadPort,
  ProductCatalogSort,
} from "../application/product-catalog-read.port";
import { ProductSpecificationBuilder } from "../domain/specifications/product-specification";
import {
  toProductListResponse,
  toProductDetailResponse,
} from "../products.mapper";
import { ProductDetailReadPort } from "../application/product-detail-read.port";

const MAX_PAGE_LIMIT = 50;
const DEFAULT_PUBLIC_LIMIT = 12;

export class CatalogService {
  constructor(
    private readonly catalogRead: ProductCatalogReadPort,
    private readonly detailRead: ProductDetailReadPort,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    keyword?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const {
      page = 1,
      limit = DEFAULT_PUBLIC_LIMIT,
      category,
      minPrice,
      maxPrice,
      keyword,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
    const skip = (page - 1) * safeLimit;

    const where = new ProductSpecificationBuilder()
      .activeOnly()
      .withCategory(category)
      .withPriceRange(minPrice, maxPrice)
      .withKeyword(keyword)
      .build()
      .toFilter();

    const orderBy: ProductCatalogSort = {
      [sortBy]: sortOrder,
    };

    const [products, total] = await Promise.all([
      this.catalogRead.findMany({
        where,
        orderBy,
        skip,
        take: safeLimit,
      }),
      this.catalogRead.count(where),
    ]);

    return {
      products: toProductListResponse(products),
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findById(id: string) {
    const product = await this.detailRead.findByIdWithReviews(id);
    if (!product) throw new ResourceNotFoundError("Product not found");
    const rating = Rating.fromReviews(product.reviews);
    return toProductDetailResponse({
      ...product,
      avgRating: rating.getAverage(),
      reviewCount: rating.getCount(),
    });
  }

  async getBySlug(slug: string) {
    const product = await this.detailRead.findBySlugWithReviews(slug);
    if (!product) throw new ResourceNotFoundError("Product not found");
    const rating = Rating.fromReviews(product.reviews);
    return toProductDetailResponse({
      ...product,
      avgRating: rating.getAverage(),
      reviewCount: rating.getCount(),
    });
  }

  async getCategories() {
    const categories = await this.catalogRead.groupByCategory();
    return categories.map((c) => ({ name: c.category, count: c.count }));
  }

  async search(query: string, page = 1, limit = DEFAULT_PUBLIC_LIMIT) {
    const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
    const skip = (page - 1) * safeLimit;
    const [results, total] = await Promise.all([
      this.catalogRead.search(query, skip, safeLimit),
      this.catalogRead.countSearch(query),
    ]);
    return {
      products: results,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
