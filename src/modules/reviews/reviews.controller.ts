import { Request, Response, NextFunction } from "express";
import { ReviewsService } from "./reviews.service";
import { BadRequestError } from "@shared/utils/errors";

const reviewsService = new ReviewsService();

export class ReviewsController {
  async getByProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await reviewsService.getReviewsByProduct(
        productId,
        page,
        limit,
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { productId, rating, content } = req.body;
      if (!productId || !rating || !content) {
        throw new BadRequestError("productId, rating and content are required");
      }
      if (rating < 1 || rating > 5) {
        throw new BadRequestError("Rating must be between 1 and 5");
      }
      const review = await reviewsService.createReview(
        userId,
        productId,
        rating,
        content,
      );
      res.status(201).json({
        success: true,
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const isAdmin = req.user!.role === "ADMIN";
      const { reviewId } = req.params;
      const result = await reviewsService.deleteReview(
        reviewId,
        userId,
        isAdmin,
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminGetAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== "ADMIN") {
        throw new BadRequestError("Admin access required");
      }
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await reviewsService.adminGetAll(page, limit);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
