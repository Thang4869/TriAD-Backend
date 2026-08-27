import { Request, Response, NextFunction } from "express";
import { ReviewsService } from "./reviews.service";
import { BadRequestError } from "@shared/utils/errors";

export class ReviewsController {
  constructor(
    private readonly service: ReviewsService = new ReviewsService(),
  ) {}

  getByProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await this.service.getReviewsByProduct(
        productId,
        page,
        limit,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { productId, rating, content } = req.body;
      if (!productId || !rating || !content) {
        throw new BadRequestError("productId, rating and content are required");
      }
      if (rating < 1 || rating > 5) {
        throw new BadRequestError("Rating must be between 1 and 5");
      }
      const review = await this.service.createReview(
        userId,
        productId,
        rating,
        content,
      );
      res.status(201).json({ success: true, data: review });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const isAdmin = req.user!.role === "ADMIN";
      const { reviewId } = req.params;
      const result = await this.service.deleteReview(reviewId, userId, isAdmin);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  adminGetAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role !== "ADMIN") {
        throw new BadRequestError("Admin access required");
      }
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await this.service.adminGetAll(page, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}