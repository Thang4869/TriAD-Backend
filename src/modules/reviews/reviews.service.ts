import prisma from "@core/database/prisma";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";

export class ReviewsService {
  async getReviewsByProduct(
    productId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { productId },
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
        skip,
        take: limit,
      }),
      prisma.review.count({ where: { productId } }),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createReview(
    userId: string,
    productId: string,
    rating: number,
    content: string,
  ) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const existing = await prisma.review.findFirst({
      where: {
        userId,
        productId,
      },
    });
    if (existing) {
      throw new BadRequestError("You have already reviewed this product");
    }

    const review = await prisma.review.create({
      data: {
        userId,
        productId,
        rating,
        comment: content,
      },
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
    });

    return review;
  }

  async deleteReview(
    reviewId: string,
    userId: string,
    isAdmin: boolean = false,
  ) {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundError("Review not found");
    }

    if (!isAdmin && review.userId !== userId) {
      throw new BadRequestError("You are not authorized to delete this review");
    }

    await prisma.review.delete({
      where: { id: reviewId },
    });

    return { deleted: true };
  }

  async adminGetAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              images: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.review.count(),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
