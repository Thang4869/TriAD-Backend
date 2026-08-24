import { Router } from "express";
import { OrdersController } from "./orders.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";

const router = Router();
const controller = new OrdersController();

router.use(authMiddleware);

router.get("/", controller.getMyOrders.bind(controller));
router.get("/:orderId", controller.getMyOrder.bind(controller));

router.get(
  "/admin/all",
  requireAdmin,
  controller.adminGetOrders.bind(controller),
);
router.patch(
  "/admin/:orderId/status",
  requireAdmin,
  controller.adminUpdateStatus.bind(controller),
);

export { router as orderRoutes };
