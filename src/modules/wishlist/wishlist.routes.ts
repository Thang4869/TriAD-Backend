import { Router } from "express";
import { WishlistController } from "./wishlist.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { addToWishlistSchema, removeFromWishlistSchema, getWishlistQuerySchema} from "./dto/wishlist.dto";

const router = Router();
const controller = new WishlistController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/wishlist:
 *   get:
 *     summary: Get current user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist items
 */
router.get(
  "/",
  validate(getWishlistQuerySchema),
  controller.getWishlist.bind(controller),
);

/**
 * @swagger
 * /api/wishlist:
 *   post:
 *     summary: Add product to wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string }
 *     responses:
 *       201:
 *         description: Added to wishlist
 *       400:
 *         description: Already in wishlist
 *       404:
 *         description: Product not found
 */
router.post(
  "/",
  validate(addToWishlistSchema),
  controller.addItem.bind(controller),
);

/**
 * @swagger
 * /api/wishlist/{productId}:
 *   delete:
 *     summary: Remove product from wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Removed
 *       404:
 *         description: Not in wishlist
 */
router.delete(
  "/:productId",
  validate(removeFromWishlistSchema),
  controller.removeItem.bind(controller),
);

export { router as wishlistRoutes };