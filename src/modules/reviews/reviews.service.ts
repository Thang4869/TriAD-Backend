import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import {
  IReviewsRepository,
  PrismaReviewsRepository,
} from "./reviews.repository";

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
  constructor(private readonly repository: IReviewsRepository) {}

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
      throw new NotFoundError("Product not found");
    }

    const existing = await this.repository.findByUserAndProduct(
      userId,
      productId,
    );
    if (existing) {
      throw new BadRequestError("You have already reviewed this product");
    }

    return this.repository.create({
      userId,
      productId,
      rating,
      comment: content,
    });
  }

  async deleteReview(reviewId: string, userId: string, isAdmin = false) {
    const review = await this.repository.findById(reviewId);
    if (!review) {
      throw new NotFoundError("Review not found");
    }

    if (!isAdmin && review.userId !== userId) {
      throw new BadRequestError("You are not authorized to delete this review");
    }

    await this.repository.delete(reviewId);
    return { deleted: true };
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
