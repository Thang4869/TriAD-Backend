import { Router } from "express";
import { OrdersController } from "./orders.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import {
  getMyOrdersQuerySchema,
  getOrderParamsSchema,
  adminGetOrdersQuerySchema,
  updateOrderStatusSchema,
} from "./dto/orders.dto";

const router = Router();
const controller = new OrdersController();

router.use(authMiddleware);

router.get(
  "/admin/all",
  requireAdmin,
  validate(adminGetOrdersQuerySchema),
  controller.adminGetOrders.bind(controller),
);

router.patch(
  "/admin/:orderId/status",
  requireAdmin,
  validate(updateOrderStatusSchema),
  controller.adminUpdateStatus.bind(controller),
);

router.get(
  "/",
  validate(getMyOrdersQuerySchema),
  controller.getMyOrders.bind(controller),
);

router.get(
  "/:orderId",
  validate(getOrderParamsSchema),
  controller.getMyOrder.bind(controller),
);

export { router as orderRoutes };
