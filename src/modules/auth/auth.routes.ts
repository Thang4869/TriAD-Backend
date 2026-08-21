import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "@shared/middlewares/validation.middleware";
import { registerSchema, loginSchema, refreshSchema } from "./dto";
import { authMiddleware } from "@shared/middlewares/auth.middleware";

const router = Router();
const controller = new AuthController();

router.post(
  "/register",
  validate(registerSchema),
  controller.register.bind(controller),
);
router.post("/login", validate(loginSchema), controller.login.bind(controller));
router.post(
  "/refresh",
  validate(refreshSchema),
  controller.refresh.bind(controller),
);
router.post("/logout", authMiddleware, controller.logout.bind(controller));

router.post(
  "/2fa/enable",
  authMiddleware,
  controller.enable2FA.bind(controller),
);
router.post(
  "/2fa/verify",
  authMiddleware,
  controller.verify2FA.bind(controller),
);

export { router as authRoutes };

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: password123
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */