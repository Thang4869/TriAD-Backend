import { Router } from "express";
import { validate } from "@shared/middlewares/validation.middleware";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { authRateLimiter } from "@shared/middlewares/rate-limit.middleware";
import { authController } from "@/container";
import passport from "./strategies/oauth2.strategy";
import { config } from "@config/index";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verify2FASchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "./dto";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validate(registerSchema),
  authController.register,
);
router.get(
  "/verify-email",
  validate(verifyEmailSchema),
  authController.verifyEmail,
);
router.post(
  "/resend-verification",
  authRateLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification,
);
router.post(
  "/login",
  authRateLimiter,
  validate(loginSchema),
  authController.login,
);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/logout", authMiddleware, authController.logout);
router.post("/2fa/enable", authMiddleware, authController.enable2FA);
router.post("/2fa/verify", authMiddleware, authController.verify2FA);
router.post(
  "/verify-totp",
  validate(verify2FASchema),
  authController.verifyTOTP,
);

// OAuth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}?error=oauth_failed`,
  }),
  authController.googleCallback,
);
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"], session: false }),
);
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}?error=oauth_failed`,
  }),
  authController.facebookCallback,
);

export { router as authRoutes };
