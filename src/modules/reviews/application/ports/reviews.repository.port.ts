import type {
  CreateReviewData,
  ReviewRecord,
  ReviewWithUser,
  ReviewWithUserAndProduct,
} from "./review-models";

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
  ): Promise<ReviewRecord | null>;

  create(data: CreateReviewData): Promise<ReviewWithUser>;

  findById(reviewId: string): Promise<ReviewRecord | null>;
  delete(reviewId: string): Promise<void>;

  findAllAdmin(skip: number, take: number): Promise<ReviewWithUserAndProduct[]>;

  count(): Promise<number>;
}
