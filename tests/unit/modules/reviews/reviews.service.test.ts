import { describe, it, expect, vi, beforeEach } from "vitest";
import { Review } from "@prisma/client";
import { ReviewsService } from "@modules/reviews/reviews.service";
import { IReviewsRepository } from "@modules/reviews/reviews.repository";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";

function createFakeRepository(
  overrides: Partial<IReviewsRepository> = {},
): IReviewsRepository {
  return {
    findByProduct: vi.fn().mockResolvedValue([]),
    countByProduct: vi.fn().mockResolvedValue(0),
    productExists: vi.fn().mockResolvedValue(true),
    findByUserAndProduct: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    findAllAdmin: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

const baseReview = {
  id: "review-1",
  userId: "user-1",
  productId: "product-1",
  rating: 5,
  comment: "Great product",
} as Review;

describe("ReviewsService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("createReview", () => {
    it("ném NotFoundError khi product không tồn tại", async () => {
      const repository = createFakeRepository({
        productExists: vi.fn().mockResolvedValue(false),
      });
      const service = new ReviewsService(repository);

      await expect(
        service.createReview("user-1", "product-x", 5, "Great"),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.findByUserAndProduct).not.toHaveBeenCalled();
    });

    it("ném BadRequestError khi user đã review sản phẩm này rồi (chặn spam review)", async () => {
      const repository = createFakeRepository({
        productExists: vi.fn().mockResolvedValue(true),
        findByUserAndProduct: vi.fn().mockResolvedValue(baseReview),
      });
      const service = new ReviewsService(repository);

      await expect(
        service.createReview("user-1", "product-1", 4, "Ok"),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("tạo review thành công với comment map đúng field từ content param", async () => {
      const repository = createFakeRepository({
        productExists: vi.fn().mockResolvedValue(true),
        findByUserAndProduct: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ ...baseReview, user: {} }),
      });
      const service = new ReviewsService(repository);

      await service.createReview("user-1", "product-1", 5, "Great product");

      expect(repository.create).toHaveBeenCalledWith({
        userId: "user-1",
        productId: "product-1",
        rating: 5,
        comment: "Great product",
      });
    });
  });

  describe("deleteReview", () => {
    it("ném NotFoundError khi review không tồn tại", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = new ReviewsService(repository);

      await expect(
        service.deleteReview("review-x", "user-1"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("ném BadRequestError khi user không phải chủ review và không phải admin", async () => {
      const repository = createFakeRepository({
        findById: vi
          .fn()
          .mockResolvedValue({ ...baseReview, userId: "another-user" }),
      });
      const service = new ReviewsService(repository);

      await expect(
        service.deleteReview("review-1", "user-1"),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it("cho phép admin xoá review của người khác", async () => {
      const repository = createFakeRepository({
        findById: vi
          .fn()
          .mockResolvedValue({ ...baseReview, userId: "another-user" }),
      });
      const service = new ReviewsService(repository);

      const result = await service.deleteReview("review-1", "admin-user", true);

      expect(repository.delete).toHaveBeenCalledWith("review-1");
      expect(result).toEqual({ deleted: true });
    });

    it("cho phép chủ sở hữu xoá chính review của mình", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseReview),
      });
      const service = new ReviewsService(repository);

      await service.deleteReview("review-1", "user-1");

      expect(repository.delete).toHaveBeenCalledWith("review-1");
    });
  });

  describe("getReviewsByProduct / adminGetAll", () => {
    it("getReviewsByProduct tính đúng skip theo page/limit", async () => {
      const repository = createFakeRepository({
        countByProduct: vi.fn().mockResolvedValue(23),
      });
      const service = new ReviewsService(repository);

      const result = await service.getReviewsByProduct("product-1", 3, 10);

      expect(repository.findByProduct).toHaveBeenCalledWith(
        "product-1",
        20,
        10,
      );
      expect(result).toMatchObject({ total: 23, totalPages: 3 });
    });

    it("adminGetAll dùng findAllAdmin/count không lọc theo product", async () => {
      const repository = createFakeRepository({
        count: vi.fn().mockResolvedValue(50),
      });
      const service = new ReviewsService(repository);

      const result = await service.adminGetAll(1, 10);

      expect(repository.findAllAdmin).toHaveBeenCalledWith(0, 10);
      expect(result).toMatchObject({ total: 50, totalPages: 5 });
    });
  });
});
