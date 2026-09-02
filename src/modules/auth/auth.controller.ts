import { Request, Response } from "express";
import { IAuthService, TwoFactorRequired } from "./auth.service";
import { logger } from "@core/logger/winston";
import { BadRequestError } from "@shared/utils/errors";
import config from "@config";
import { asyncHandler } from "@shared/utils/async-handler";

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: (config.isProduction ? "none" : "lax") as "none" | "lax",
  path: "/",
  maxAge,
  ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
});

function is2FAResult(result: unknown): result is TwoFactorRequired {
  return (
    typeof result === "object" &&
    result !== null &&
    "requires2FA" in result &&
    (result as TwoFactorRequired).requires2FA === true
  );
}

export class AuthController {
  constructor(private readonly service: IAuthService) {}

  register = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.service.register(req.body);
    res.status(201).json({
      success: true,
      data: { user: result.user },
      message: result.message,
    });
  });

  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) {
      throw new BadRequestError("Verification token is required");
    }
    const result = await this.service.verifyEmail(token);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({
      success: true,
      data: { user: result.user },
      message: "Email verified successfully",
    });
  });

  resendVerification = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await this.service.resendVerificationEmail(email);
    res.json({ success: true, message: result.message });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await this.service.login(email, password);

    if (is2FAResult(result)) {
      res.json({
        success: true,
        data: {
          requires2FA: true,
          userId: result.userId,
          message: result.message,
        },
      });
      return;
    }

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ success: true, data: { user: result.user } });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    if (!refreshToken) {
      throw new BadRequestError("Refresh token required");
    }
    const result = await this.service.refreshToken(refreshToken);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ success: true, data: { user: result.user } });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const accessToken = req.headers.authorization?.split(" ")[1];
    const refreshToken = req.cookies?.refreshToken;
    await this.service.logout(userId, accessToken, refreshToken);

    res.clearCookie("accessToken", cookieOptions(0));
    res.clearCookie("refreshToken", cookieOptions(0));

    res.json({ success: true, message: "Logged out successfully" });
  });

  enable2FA = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await this.service.enable2FA(userId);
    res.json({ success: true, data: result });
  });

  verify2FA = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { token } = req.body;
    if (!token) {
      throw new BadRequestError("Token is required");
    }
    const result = await this.service.verify2FA(userId, token);
    res.json({ success: true, data: result });
  });

  verifyTOTP = asyncHandler(async (req: Request, res: Response) => {
    const { userId, token } = req.body;
    if (!userId || !token) {
      throw new BadRequestError("userId and token are required");
    }
    const result = await this.service.verifyTOTP(userId, token);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ success: true, data: { user: result.user } });
  });

  googleCallback = async (req: Request, res: Response) => {
    try {
      const { tokens } = req.user as any;
      this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      res.redirect(config.FRONTEND_URL);
    } catch (error) {
      logger.error("Google callback error:", error);
      res.redirect(`${config.FRONTEND_URL}?error=auth_failed`);
    }
  };

  facebookCallback = async (req: Request, res: Response) => {
    try {
      const { tokens } = req.user as any;
      this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      res.redirect(config.FRONTEND_URL);
    } catch (error) {
      logger.error("Facebook callback error:", error);
      res.redirect(`${config.FRONTEND_URL}?error=auth_failed`);
    }
  };

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie("accessToken", accessToken, cookieOptions(15 * 60 * 1000));
    res.cookie(
      "refreshToken",
      refreshToken,
      cookieOptions(7 * 24 * 60 * 60 * 1000),
    );
  }
}
