import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { checkoutController } from "@/container";
import {
  checkoutSchema,
  getOrdersQuerySchema,
  getOrderParamsSchema,
} from "./dto/checkout.dto";

const router = Router();
router.use(authMiddleware);

router.post(
  "/",
  validate(checkoutSchema),
  idempotencyMiddleware(),
  checkoutController.checkout,
);
router.get(
  "/orders",
  validate(getOrdersQuerySchema),
  checkoutController.getOrders,
);
router.get(
  "/orders/:orderId",
  validate(getOrderParamsSchema),
  checkoutController.getOrder,
);

export { router as checkoutRoutes };
