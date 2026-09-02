import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { reviewsController } from "@/container";
import {
  createReviewSchema,
  getReviewsQuerySchema,
  deleteReviewParamsSchema,
  adminGetAllReviewsQuerySchema,
} from "./dto/reviews.dto";

const router = Router();

router.get(
  "/product/:productId",
  validate(getReviewsQuerySchema),
  reviewsController.getByProduct,
);
router.post(
  "/",
  validate(createReviewSchema),
  authMiddleware,
  reviewsController.create,
);
router.delete(
  "/:reviewId",
  validate(deleteReviewParamsSchema),
  authMiddleware,
  reviewsController.delete,
);
router.get(
  "/admin/all",
  validate(adminGetAllReviewsQuerySchema),
  authMiddleware,
  requireAdmin,
  reviewsController.adminGetAll,
);

export { router as reviewRoutes };
