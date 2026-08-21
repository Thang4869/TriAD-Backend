import prisma from '@core/database/prisma';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@shared/utils/errors';

export class ProductsService {
  async findAll(params: {
    page?: number;
    limit?: number;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    keyword?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 12, category, minPrice, maxPrice, keyword, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category && { category }),
      ...(minPrice !== undefined && { price: { gte: minPrice } }),
      ...(maxPrice !== undefined && { price: { lte: maxPrice } }),
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
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
        take: limit,
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

    // Calculate average rating
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
      limit,
      totalPages: Math.ceil(total / limit),
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
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const avgRating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
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
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const avgRating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
        : 0;

    return {
      ...product,
      avgRating,
      reviewCount: product.reviews.length,
    };
  }

  async getCategories() {
    const categories = await prisma.product.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { category: true },
    });
    return categories.map((c) => ({
      name: c.category,
      count: c._count.category,
    }));
  }
}