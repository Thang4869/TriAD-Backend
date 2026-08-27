import prisma from "@core/database/prisma";
import { Prisma, Review } from "@prisma/client";

const REVIEWER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

export type ReviewWithUser = Prisma.ReviewGetPayload<{
  include: { user: { select: typeof REVIEWER_SELECT } };
}>;

export type ReviewWithUserAndProduct = Prisma.ReviewGetPayload<{
  include: {
    user: { select: typeof REVIEWER_SELECT };
    product: { select: { id: true; name: true; images: true } };
  };
}>;

export interface CreateReviewData {
  userId: string;
  productId: string;
  rating: number;
  comment: string;
}

// ---------- Repository contract ----------

export interface IReviewsRepository {
  findByProduct(
    productId: string,
    skip: number,
    take: number,
  ): Promise<ReviewWithUser[]>;
  countByProduct(productId: string): Promise<number>;

  productExists(productId: string): Promise<boolean>;
  findByUserAndProduct(
    userId: string,
    productId: string,
  ): Promise<Review | null>;
  create(data: CreateReviewData): Promise<ReviewWithUser>;

  findById(reviewId: string): Promise<Review | null>;
  delete(reviewId: string): Promise<void>;

  findAllAdmin(
    skip: number,
    take: number,
  ): Promise<ReviewWithUserAndProduct[]>;
  count(): Promise<number>;
}

// ---------- Prisma implementation ----------

export class PrismaReviewsRepository implements IReviewsRepository {
  async findByProduct(
    productId: string,
    skip: number,
    take: number,
  ): Promise<ReviewWithUser[]> {
    return prisma.review.findMany({
      where: { productId },
      include: { user: { select: REVIEWER_SELECT } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async countByProduct(productId: string): Promise<number> {
    return prisma.review.count({ where: { productId } });
  }

  async productExists(productId: string): Promise<boolean> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    return product !== null;
  }

  async findByUserAndProduct(
    userId: string,
    productId: string,
  ): Promise<Review | null> {
    return prisma.review.findFirst({ where: { userId, productId } });
  }

  async create(data: CreateReviewData): Promise<ReviewWithUser> {
    return prisma.review.create({
      data,
      include: { user: { select: REVIEWER_SELECT } },
    });
  }

  async findById(reviewId: string): Promise<Review | null> {
    return prisma.review.findUnique({ where: { id: reviewId } });
  }

  async delete(reviewId: string): Promise<void> {
    await prisma.review.delete({ where: { id: reviewId } });
  }

  async findAllAdmin(
    skip: number,
    take: number,
  ): Promise<ReviewWithUserAndProduct[]> {
    return prisma.review.findMany({
      include: {
        user: { select: REVIEWER_SELECT },
        product: { select: { id: true, name: true, images: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async count(): Promise<number> {
    return prisma.review.count();
  }
}