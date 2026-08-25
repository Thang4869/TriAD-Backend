import { Router } from "express";
import { UsersController } from "./users.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { 
  updateProfileSchema, 
  changePasswordSchema 
} from "./dto/users.dto";

const router = Router();
const controller = new UsersController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/me", 
  controller.getProfile.bind(controller)
);

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.put(
  "/me", 
  validate(updateProfileSchema), 
  controller.updateProfile.bind(controller)
);

/**
 * @swagger
 * /api/users/me/password:
 *   put:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed
 */
router.put(
  "/me/password", 
  validate(changePasswordSchema), 
  controller.changePassword.bind(controller)
);

export { router as userRoutes };