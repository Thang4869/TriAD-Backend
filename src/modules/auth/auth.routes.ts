import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "@shared/middlewares/validation.middleware";
import { config } from "@config/index";

import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verify2FASchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "./dto";

import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { authRateLimiter } from "@shared/middlewares/rate-limit.middleware";
import passport from "./strategies/oauth2.strategy";

const router = Router();
const controller = new AuthController();

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
 *                 format: email
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
 *               phone:
 *                 type: string
 *                 example: 0123456789
 *     responses:
 *       201:
 *         description: User registered successfully, verification email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       409:
 *         description: Email already registered
 */
router.post(
  "/register",
  authRateLimiter,
  validate(registerSchema),
  controller.register.bind(controller),
);

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify user email using token sent by mail
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified, tokens returned (auto-login)
 *       400:
 *         description: Invalid or expired verification token
 */
router.get(
  "/verify-email",
  validate(verifyEmailSchema),
  controller.verifyEmail.bind(controller),
);

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend the email verification link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email sent if applicable
 */
router.post(
  "/resend-verification",
  authRateLimiter,
  validate(resendVerificationSchema),
  controller.resendVerification.bind(controller),
);

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
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         refreshToken:
 *                           type: string
 *                         user:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             email:
 *                               type: string
 *                             firstName:
 *                               type: string
 *                             lastName:
 *                               type: string
 *                             role:
 *                               type: string
 *                             is2FAEnabled:
 *                               type: boolean
 *                     - type: object
 *                       properties:
 *                         requires2FA:
 *                           type: boolean
 *                           example: true
 *                         userId:
 *                           type: string
 *                         message:
 *                           type: string
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 */
router.post(
  "/login",
  authRateLimiter,
  validate(loginSchema),
  controller.login.bind(controller),
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: New tokens generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                         role:
 *                           type: string
 *                         is2FAEnabled:
 *                           type: boolean
 *       401:
 *         description: Invalid refresh token
 */
router.post(
  "/refresh",
  validate(refreshSchema),
  controller.refresh.bind(controller),
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/logout", authMiddleware, controller.logout.bind(controller));

/**
 * @swagger
 * /api/auth/2fa/enable:
 *   post:
 *     summary: Enable 2FA for user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     otpauthUrl:
 *                       type: string
 *                       example: otpauth://totp/TriAD:user@example.com?secret=...
 *                     secret:
 *                       type: string
 *                       example: JBSWY3DPEHPK3PXP
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post(
  "/2fa/enable",
  authMiddleware,
  controller.enable2FA.bind(controller),
);

/**
 * @swagger
 * /api/auth/2fa/verify:
 *   post:
 *     summary: Verify and activate 2FA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: 123456
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Invalid token
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/2fa/verify",
  authMiddleware,
  controller.verify2FA.bind(controller),
);

/**
 * @swagger
 * /api/auth/verify-totp:
 *   post:
 *     summary: Verify TOTP for login (2FA)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - token
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               token:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: 123456
 *     responses:
 *       200:
 *         description: TOTP verified, tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                         role:
 *                           type: string
 *                         is2FAEnabled:
 *                           type: boolean
 *       400:
 *         description: Invalid token or userId
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post(
  "/verify-totp",
  validate(verify2FASchema),
  controller.verifyTOTP.bind(controller),
);

// OAuth routes
/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Redirect to Google OAuth
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to frontend with cookies
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}?error=oauth_failed`,
  }),
  controller.googleCallback.bind(controller),
);

/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: Redirect to Facebook OAuth
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to Facebook
 */
router.get(
  "/facebook",
  passport.authenticate("facebook", {
    scope: ["email"],
    session: false,
  }),
);

/**
 * @swagger
 * /api/auth/facebook/callback:
 *   get:
 *     summary: Facebook OAuth callback
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to frontend with cookies
 */
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}?error=oauth_failed`,
  }),
  controller.facebookCallback.bind(controller),
);

export { router as authRoutes };
