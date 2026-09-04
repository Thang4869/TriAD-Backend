import { Request, Response } from "express";
import { ReviewsService } from "./reviews.service";
import { BadRequestError } from "@shared/utils/errors";
import { asyncHandler } from "@shared/utils/async-handler";

export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  getByProduct = asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.getReviewsByProduct(
      productId,
      page,
      limit,
    );
    res.json({ success: true, data: result });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
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
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const isAdmin = (req.user as { role?: string })?.role === "ADMIN";
    const { reviewId } = req.params;
    const result = await this.service.deleteReview(reviewId, userId, isAdmin);
    res.json({ success: true, data: result });
  });

  adminGetAll = asyncHandler(async (req: Request, res: Response) => {
    if ((req.user as { role?: string })?.role !== "ADMIN") {
      throw new BadRequestError("Admin access required");
    }
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.adminGetAll(page, limit);
    res.json({ success: true, data: result });
  });
}
