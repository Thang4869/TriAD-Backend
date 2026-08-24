import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { logger } from "@core/logger/winston";
import { BadRequestError } from "@shared/utils/errors";
import config from "@config";

const authService = new AuthService();

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge,
  ...(config.isProduction && { domain: process.env.COOKIE_DOMAIN }),
});

// Type guard: checks for the 2FA variant
function is2FAResult(
  result: any,
): result is { requires2FA: true; userId: string; message: string } {
  return (
    result &&
    typeof result === "object" &&
    "requires2FA" in result &&
    result.requires2FA === true
  );
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      res.status(201).json({
        success: true,
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      // If 2FA is required, return the 2FA response
      if (is2FAResult(result)) {
        return res.json({
          success: true,
          data: {
            requires2FA: true,
            userId: result.userId,
            message: result.message,
          },
        });
      }

      // TypeScript now correctly infers result as the success variant
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      res.json({
        success: true,
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      if (!refreshToken) {
        throw new BadRequestError("Refresh token required");
      }
      const result = await authService.refreshToken(refreshToken);
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      res.json({
        success: true,
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const accessToken = req.headers.authorization?.split(" ")[1];
      const refreshToken = req.cookies?.refreshToken;
      await authService.logout(userId, accessToken, refreshToken);

      res.clearCookie("accessToken", cookieOptions(0));
      res.clearCookie("refreshToken", cookieOptions(0));

      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  }

  async enable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await authService.enable2FA(userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async verify2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { token } = req.body;
      if (!token) {
        throw new BadRequestError("Token is required");
      }
      const result = await authService.verify2FA(userId, token);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async verifyTOTP(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, token } = req.body;
      if (!userId || !token) {
        throw new BadRequestError("userId and token are required");
      }
      const result = await authService.verifyTOTP(userId, token);
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      res.json({
        success: true,
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

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

  async googleCallback(req: Request, res: Response) {
    try {
      const { user, tokens } = req.user as any;
      this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      res.redirect(config.FRONTEND_URL);
    } catch (error) {
      logger.error("Google callback error:", error);
      res.redirect(`${config.FRONTEND_URL}?error=auth_failed`);
    }
  }

  async facebookCallback(req: Request, res: Response) {
    try {
      const { user, tokens } = req.user as any;
      this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      res.redirect(config.FRONTEND_URL);
    } catch (error) {
      logger.error("Facebook callback error:", error);
      res.redirect(`${config.FRONTEND_URL}?error=auth_failed`);
    }
  }
}