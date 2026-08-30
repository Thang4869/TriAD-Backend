import { Prisma } from "@prisma/client";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import {
  IProductsRepository,
  PrismaProductsRepository,
  CreateProductData,
  UpdateProductData,
} from "./products.repository";
import {
  toProductListResponse,
  toProductDetailResponse,
} from "./products.mapper";
import { imageQueue } from "@core/queue/bull";

const MAX_PAGE_LIMIT = 50;
const DEFAULT_PUBLIC_LIMIT = 12;
const DEFAULT_ADMIN_LIMIT = 20;

export interface FindProductsParams {
  page?: number;
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  keyword?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface AdminFindProductsParams {
  page?: number;
  limit?: number;
  category?: string;
  keyword?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface IProductsService {
  findAll(params: FindProductsParams): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  getBySlug(slug: string): Promise<unknown>;
  getCategories(): Promise<unknown>;
  adminFindAll(params: AdminFindProductsParams): Promise<unknown>;
  create(data: CreateProductData): Promise<unknown>;
  update(id: string, data: UpdateProductData): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  restore(id: string): Promise<unknown>;
  uploadImage(
    productId: string,
    localFilePath: string,
  ): Promise<{ queued: true }>;
  search(query: string, page?: number, limit?: number): Promise<unknown>;
}

function calculateAvgRating(reviews: { rating: number }[]): number {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return sum / reviews.length;
}

function buildPagination(page: number, limit: number, cap = MAX_PAGE_LIMIT) {
  const safeLimit = Math.min(limit, cap);
  const skip = (page - 1) * safeLimit;
  return { safeLimit, skip };
}

export class ProductsService implements IProductsService {
  constructor(
    private readonly repository: IProductsRepository = new PrismaProductsRepository(),
  ) {}

  async findAll(params: FindProductsParams) {
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

    const { safeLimit, skip } = buildPagination(page, limit);

    const priceFilter: Prisma.ProductWhereInput["price"] = {};
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category && { category }),
      ...(Object.keys(priceFilter).length > 0 && { price: priceFilter }),
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: "insensitive" } },
          { description: { contains: keyword, mode: "insensitive" } },
        ],
      }),
    };

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

    const productsWithRating = products.map((product) => ({
      ...product,
      avgRating: calculateAvgRating(product.reviews),
      reviewCount: product.reviews.length,
    }));

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
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    return toProductDetailResponse({
      ...product,
      avgRating: calculateAvgRating(product.reviews),
      reviewCount: product.reviews.length,
    });
  }

  async getBySlug(slug: string) {
    const product = await this.repository.findBySlugWithReviews(slug);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    return toProductDetailResponse({
      ...product,
      avgRating: calculateAvgRating(product.reviews),
      reviewCount: product.reviews.length,
    });
  }

  async getCategories() {
    const categories = await this.repository.groupByCategory();
    return categories.map((c) => ({ name: c.category, count: c.count }));
  }

  // ---------- Admin methods ----------

  async adminFindAll(params: AdminFindProductsParams) {
    const {
      page = 1,
      limit = DEFAULT_ADMIN_LIMIT,
      category,
      keyword,
      isActive,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const { safeLimit, skip } = buildPagination(page, limit);

    const where: Prisma.ProductWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(category && { category }),
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: "insensitive" } },
          { description: { contains: keyword, mode: "insensitive" } },
        ],
      }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [products, total] = await Promise.all([
      this.repository.findManyAdmin({ where, orderBy, skip, take: safeLimit }),
      this.repository.count(where),
    ]);

    return {
      products,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async create(data: CreateProductData) {
    const existing = await this.repository.findBySlugId(data.slug);
    if (existing) {
      throw new BadRequestError("Slug already exists");
    }
    return this.repository.create(data);
  }

  async update(id: string, data: UpdateProductData) {
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (data.slug && data.slug !== product.slug) {
      const existing = await this.repository.findBySlugId(data.slug);
      if (existing) {
        throw new BadRequestError("Slug already exists");
      }
    }

    return this.repository.update(id, data);
  }

  async delete(id: string) {
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    if (!product.isActive) {
      throw new BadRequestError("Product is already deactivated");
    }
    return this.repository.setActive(id, false);
  }

  async restore(id: string) {
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    if (product.isActive) {
      throw new BadRequestError("Product is already active");
    }
    return this.repository.setActive(id, true);
  }

  async uploadImage(productId: string, localFilePath: string) {
    const exists = await this.repository.existsAndActive(productId);
    if (!exists) {
      throw new NotFoundError("Product not found");
    }

    await imageQueue.add("process-product-image", {
      productId,
      localFilePath,
    });

    return { queued: true as const };
  }

  async search(query: string, page = 1, limit = DEFAULT_PUBLIC_LIMIT) {
    const { safeLimit, skip } = buildPagination(page, limit);

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
