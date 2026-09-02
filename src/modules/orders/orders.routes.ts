import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { ordersController } from "@/container";
import {
  getMyOrdersQuerySchema,
  getOrderParamsSchema,
  adminGetOrdersQuerySchema,
  updateOrderStatusSchema,
} from "./dto/orders.dto";

const router = Router();
router.use(authMiddleware);

router.get(
  "/admin/all",
  requireAdmin,
  validate(adminGetOrdersQuerySchema),
  ordersController.adminGetOrders,
);
router.patch(
  "/admin/:orderId/status",
  requireAdmin,
  validate(updateOrderStatusSchema),
  ordersController.adminUpdateStatus,
);
router.get("/", validate(getMyOrdersQuerySchema), ordersController.getMyOrders);
router.get(
  "/:orderId",
  validate(getOrderParamsSchema),
  ordersController.getMyOrder,
);

export { router as orderRoutes };
