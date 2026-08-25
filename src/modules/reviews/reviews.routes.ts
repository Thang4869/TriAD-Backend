import { Router } from "express";
import { ReviewsController } from "./reviews.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import {
  createReviewSchema,
  getReviewsQuerySchema,
  deleteReviewParamsSchema,
  adminGetAllReviewsQuerySchema,
} from "./dto/reviews.dto";

const router = Router();
const controller = new ReviewsController();

router.get(
  "/product/:productId", 
  validate(getReviewsQuerySchema), 
  controller.getByProduct.bind(controller)
);

router.post(
  "/", 
  validate(createReviewSchema), 
  authMiddleware, 
  controller.create.bind(controller)
);

router.delete(
  "/:reviewId", 
  validate(deleteReviewParamsSchema), 
  authMiddleware, 
  controller.delete.bind(controller)
);

router.get(
  "/admin/all",
  validate(adminGetAllReviewsQuerySchema),
  authMiddleware,
  requireAdmin,
  controller.adminGetAll.bind(controller),
);

export { router as reviewRoutes };
