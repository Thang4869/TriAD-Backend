import {
  ResourceNotFoundError,
  ValidationError,
} from "@shared/errors/application-error";
import type { IReviewsRepository } from "./application/ports/reviews.repository.port";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
} from "@shared/domain/events/review-events";
export interface IReviewsService {
  getReviewsByProduct(
    productId: string,
    page?: number,
    limit?: number,
  ): Promise<unknown>;
  createReview(
    userId: string,
    productId: string,
    rating: number,
    content: string,
  ): Promise<unknown>;
  deleteReview(
    reviewId: string,
    userId: string,
    isAdmin?: boolean,
  ): Promise<{ deleted: true }>;
  adminGetAll(page?: number, limit?: number): Promise<unknown>;
}

export class ReviewsService implements IReviewsService {
  constructor(
    private readonly repository: IReviewsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async getReviewsByProduct(productId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.repository.findByProduct(productId, skip, limit),
      this.repository.countByProduct(productId),
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
    const exists = await this.repository.productExists(productId);
    if (!exists) {
      throw new ResourceNotFoundError("Product not found");
    }

    const existing = await this.repository.findByUserAndProduct(
      userId,
      productId,
    );
    if (existing) {
      throw new ValidationError("You have already reviewed this product");
    }

    const review = await this.repository.create({
      userId,
      productId,
      rating,
      comment: content,
    });

    await this.eventBus.publish(new ReviewCreatedEvent(productId));

    return review;
  }

  async deleteReview(reviewId: string, userId: string, isAdmin = false) {
    const review = await this.repository.findById(reviewId);
    if (!review) {
      throw new ResourceNotFoundError("Review not found");
    }

    if (!isAdmin && review.userId !== userId) {
      throw new ValidationError("You are not authorized to delete this review");
    }

    await this.repository.delete(reviewId);
    await this.eventBus.publish(new ReviewDeletedEvent(review.productId));

    return { deleted: true } as const;
  }

  async adminGetAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.repository.findAllAdmin(skip, limit),
      this.repository.count(),
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
