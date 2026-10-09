import prisma from "@core/database/prisma";

import type { IReviewsRepository } from "../../application/ports/reviews.repository.port";
import type {
  CreateReviewData,
  ReviewRecord,
  ReviewWithUser,
  ReviewWithUserAndProduct,
} from "../../application/ports/review-models";
import { persistEvents } from "@core/outbox/persist-domain-events";
import {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
} from "@shared/domain/events/review-events";
const REVIEWER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

// ---------- Prisma implementation ----------

export class PrismaReviewsRepository implements IReviewsRepository {
  constructor(
    private readonly persistDomainEvents: typeof persistEvents = persistEvents,
  ) {}
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
  ): Promise<ReviewRecord | null> {
    return prisma.review.findFirst({
      where: { userId, productId },
      select: {
        id: true,
        userId: true,
        productId: true,
      },
    });
  }

  async create(data: CreateReviewData): Promise<ReviewWithUser> {
    return prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data,
        include: { user: { select: REVIEWER_SELECT } },
      });

      await this.persistDomainEvents(tx, [
        new ReviewCreatedEvent(review.productId),
      ]);

      return review;
    });
  }

  async findById(reviewId: string): Promise<ReviewRecord | null> {
    return prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        productId: true,
      },
    });
  }

  async delete(reviewId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const review = await tx.review.delete({
        where: { id: reviewId },
        select: { productId: true },
      });

      await this.persistDomainEvents(tx, [
        new ReviewDeletedEvent(review.productId),
      ]);
    });
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
