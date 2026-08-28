import { Request, Response } from "express";
import { UsersService } from "./users.service";
import { BadRequestError } from "@shared/utils/errors";
import { asyncHandler } from "@shared/utils/async-handler";

export class UsersController {
  constructor(
    private readonly service: UsersService = new UsersService(),
  ) {}

  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const profile = await this.service.getProfile(userId);
    res.json({ success: true, data: profile });
  });

  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { firstName, lastName, phone } = req.body;
    const updated = await this.service.updateProfile(userId, {
      firstName,
      lastName,
      phone,
    });
    res.json({ success: true, data: updated });
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new BadRequestError(
        "currentPassword and newPassword are required",
      );
    }
    await this.service.changePassword(userId, currentPassword, newPassword);
    res.json({ success: true, message: "Password changed successfully" });
  });
}