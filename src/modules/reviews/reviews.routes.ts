import { Router } from "express";
import { ReviewsController } from "./reviews.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";

const router = Router();
const controller = new ReviewsController();

router.get("/product/:productId", controller.getByProduct.bind(controller));

router.post("/", authMiddleware, controller.create.bind(controller));

router.delete("/:reviewId", authMiddleware, controller.delete.bind(controller));

router.get(
  "/admin/all",
  authMiddleware,
  requireAdmin,
  controller.adminGetAll.bind(controller),
);

export { router as reviewRoutes };
