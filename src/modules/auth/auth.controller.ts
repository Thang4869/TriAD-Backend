import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { logger } from "@core/logger/winston";
import { BadRequestError } from "@shared/utils/errors";

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        throw new BadRequestError("Refresh token required");
      }
      const result = await authService.refreshToken(refreshToken);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const accessToken = req.headers.authorization?.split(" ")[1];
      const refreshToken = req.body.refreshToken;
      await authService.logout(userId, accessToken, refreshToken);
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
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async googleCallback(req: Request, res: Response) {
    const { user, tokens } = req.user as any;
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }

  async facebookCallback(req: Request, res: Response) {
    const { user, tokens } = req.user as any;
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }
}
