import { Router } from "express";
import { authMiddleware } from "@/container";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { checkoutController } from "@/container";
import {
  checkoutSchema,
  checkoutQuoteSchema,
  getOrdersQuerySchema,
  getOrderParamsSchema,
} from "./dto/checkout.dto";

const router = Router();
router.use(authMiddleware);

router.get("/quote", validate(checkoutQuoteSchema), checkoutController.quote);

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
