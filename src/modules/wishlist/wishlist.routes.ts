import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { wishlistController } from "@/container";
import {
  addToWishlistSchema,
  removeFromWishlistSchema,
  getWishlistQuerySchema,
} from "./dto/wishlist.dto";

const router = Router();
router.use(authMiddleware);

router.get(
  "/",
  validate(getWishlistQuerySchema),
  wishlistController.getWishlist,
);
router.post("/", validate(addToWishlistSchema), wishlistController.addItem);
router.delete(
  "/:productId",
  validate(removeFromWishlistSchema),
  wishlistController.removeItem,
);

export { router as wishlistRoutes };
