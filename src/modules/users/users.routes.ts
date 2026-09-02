import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { usersController } from "@/container";
import { updateProfileSchema, changePasswordSchema } from "./dto/users.dto";

const router = Router();
router.use(authMiddleware);

router.get("/me", usersController.getProfile);
router.put("/me", validate(updateProfileSchema), usersController.updateProfile);
router.put(
  "/me/password",
  validate(changePasswordSchema),
  usersController.changePassword,
);

export { router as userRoutes };
