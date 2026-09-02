import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { cartController } from "@/container";
import { addItemSchema, updateItemSchema } from "./dto/cart.dto";

const router = Router();
router.use(authMiddleware);

router.get("/", cartController.getCart);
router.post("/items", validate(addItemSchema), cartController.addItem);
router.put(
  "/items/:productId",
  validate(updateItemSchema),
  cartController.updateItem,
);
router.delete("/items/:productId", cartController.removeItem);
router.delete("/", cartController.clearCart);

export { router as cartRoutes };
