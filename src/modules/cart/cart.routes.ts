import { Router } from "express";
import { CartController } from "./cart.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { 
    addItemSchema, 
    updateItemSchema 
} from "./dto/cart.dto";

const router = Router();
const controller = new CartController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get current user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart with items
 */
router.get(
    "/", 
    controller.getCart.bind(controller)
);

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: Item added
 */
router.post(
    "/items", 
    validate(addItemSchema),
    controller.addItem.bind(controller)
);

/**
 * @swagger
 * /api/cart/items/{productId}:
 *   put:
 *     summary: Update item quantity
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Item updated
 */
router.put(
    "/items/:productId", 
    validate(updateItemSchema),
    controller.updateItem.bind(controller)
);

/**
 * @swagger
 * /api/cart/items/{productId}:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Item removed
 */
router.delete(
    "/items/:productId", 
    controller.removeItem.bind(controller)
);

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Clear entire cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.delete(
    "/", 
    controller.clearCart.bind(controller)
);

export { router as cartRoutes };
