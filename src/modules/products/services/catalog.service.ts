import { Prisma } from "@prisma/client";
import { NotFoundError } from "@shared/utils/errors";
import { Rating } from "@shared/value-objects/rating";
import { IProductsRepository } from "../products.repository";
import { ProductSpecificationBuilder } from "../domain/specifications/product-specification";
import {
  toProductListResponse,
  toProductDetailResponse,
} from "../products.mapper";

const MAX_PAGE_LIMIT = 50;
const DEFAULT_PUBLIC_LIMIT = 12;

export class CatalogService {
  constructor(private readonly repository: IProductsRepository) {}

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
      .toPrismaWhere();

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [products, total] = await Promise.all([
      this.repository.findManyWithRatings({
        where,
        orderBy,
        skip,
        take: safeLimit,
      }),
      this.repository.count(where),
    ]);

    const productsWithRating = products.map((product) => {
      const rating = Rating.fromReviews(product.reviews);
      return {
        ...product,
        avgRating: rating.getAverage(),
        reviewCount: rating.getCount(),
      };
    });

    return {
      products: toProductListResponse(productsWithRating),
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findById(id: string) {
    const product = await this.repository.findByIdWithReviews(id);
    if (!product) throw new NotFoundError("Product not found");
    const rating = Rating.fromReviews(product.reviews);
    return toProductDetailResponse({
      ...product,
      avgRating: rating.getAverage(),
      reviewCount: rating.getCount(),
    });
  }

  async getBySlug(slug: string) {
    const product = await this.repository.findBySlugWithReviews(slug);
    if (!product) throw new NotFoundError("Product not found");
    const rating = Rating.fromReviews(product.reviews);
    return toProductDetailResponse({
      ...product,
      avgRating: rating.getAverage(),
      reviewCount: rating.getCount(),
    });
  }

  async getCategories() {
    const categories = await this.repository.groupByCategory();
    return categories.map((c) => ({ name: c.category, count: c.count }));
  }

  async search(query: string, page = 1, limit = DEFAULT_PUBLIC_LIMIT) {
    const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
    const skip = (page - 1) * safeLimit;
    const [results, total] = await Promise.all([
      this.repository.searchFullText(query, skip, safeLimit),
      this.repository.countFullTextSearch(query),
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
