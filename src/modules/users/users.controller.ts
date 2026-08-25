import { Request, Response, NextFunction } from "express";
import { UsersService } from "./users.service";
import { BadRequestError } from "@shared/utils/errors";

const usersService = new UsersService();

export class UsersController {
    // GET /api/users/me
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const profile = await usersService.getProfile(userId);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/users/me
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { firstName, lastName, phone } = req.body;
      const updated = await usersService.updateProfile(userId, {
        firstName,
        lastName,
        phone,
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/users/me/password
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        throw new BadRequestError("currentPassword and newPassword are required");
      }
      const result = await usersService.changePassword(userId, currentPassword, newPassword);
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      next(error);
    }
  }
}