import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";

export class ProductsService {
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
      limit = 12,
      category,
      minPrice,
      maxPrice,
      keyword,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const MAX_LIMIT = 50;
    const safeLimit = Math.min(limit, MAX_LIMIT);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category && { category }),
      ...(minPrice !== undefined && { price: { gte: minPrice } }),
      ...(maxPrice !== undefined && { price: { lte: maxPrice } }),
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
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: safeLimit,
        include: {
          reviews: {
            select: {
              rating: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const productsWithRating = products.map((p) => ({
      ...p,
      avgRating:
        p.reviews.length > 0
          ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length
          : 0,
      reviewCount: p.reviews.length,
    }));

    return {
      products: productsWithRating,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const avgRating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) /
          product.reviews.length
        : 0;

    return {
      ...product,
      avgRating,
      reviewCount: product.reviews.length,
    };
  }

  async getBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const avgRating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) /
          product.reviews.length
        : 0;

    return {
      ...product,
      avgRating,
      reviewCount: product.reviews.length,
    };
  }

  async getCategories() {
    const categories = await prisma.product.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    });
    return categories.map((c) => ({
      name: c.category,
      count: c._count.category,
    }));
  }

  // ---------- Admin methods ----------

  async adminFindAll(params: {
    page?: number;
    limit?: number;
    category?: string;
    keyword?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const {
      page = 1,
      limit = 20,
      category,
      keyword,
      isActive,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const MAX_LIMIT = 50;
    const safeLimit = Math.min(limit, MAX_LIMIT);
    const skip = (page - 1) * safeLimit;

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
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: safeLimit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async create(data: {
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    images: string[];
    slug: string;
  }) {
    const existing = await prisma.product.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestError("Slug already exists");
    }

    return prisma.product.create({
      data: {
        ...data,
        isActive: true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      stock: number;
      category: string;
      images: string[];
      slug: string;
      isActive: boolean;
    }>,
  ) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (data.slug && data.slug !== product.slug) {
      const existing = await prisma.product.findUnique({
        where: { slug: data.slug },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestError("Slug already exists");
      }
    }

    return prisma.product.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (!product.isActive) {
      throw new BadRequestError("Product is already deactivated");
    }

    return prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async restore(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (product.isActive) {
      throw new BadRequestError("Product is already active");
    }

    return prisma.product.update({
      where: { id },
      data: { isActive: true },
    });
  }
}