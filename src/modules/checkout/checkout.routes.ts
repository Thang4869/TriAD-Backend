import { Router } from "express";
import { CheckoutController } from "./checkout.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { 
    checkoutSchema, 
    getOrdersQuerySchema, 
    getOrderParamsSchema 
} from "./dto/checkout.dto";

const router = Router();
const controller = new CheckoutController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/checkout:
 *   post:
 *     summary: Place an order (checkout)
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethod
 *               - address
 *               - phone
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum: [COD, CARD, BANKING]
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               notes:
 *                 type: string
 *               discountCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order placed successfully
 */
router.post(
  "/",
  validate(checkoutSchema),
  idempotencyMiddleware(),
  controller.checkout.bind(controller),
);

/**
 * @swagger
 * /api/checkout/orders:
 *   get:
 *     summary: Get user's orders
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get(
  "/orders",
  validate(getOrdersQuerySchema),
  controller.getOrders.bind(controller)
);

/**
 * @swagger
 * /api/checkout/orders/{orderId}:
 *   get:
 *     summary: Get order details
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 */
router.get(
  "/orders/:orderId",
  validate(getOrderParamsSchema),
  controller.getOrder.bind(controller),
);

export { router as checkoutRoutes };
