import { Request, Response } from "express";
import { IUsersService } from "./users.service";
import { BadRequestError } from "@shared/utils/errors";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess, sendMessage } from "@shared/utils/api-response";

export class UsersController {
  constructor(private readonly service: IUsersService) {}

  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const profile = await this.service.getProfile(userId);
    sendSuccess(res, profile);
  });

  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { firstName, lastName, phone } = req.body;
    const updated = await this.service.updateProfile(userId, {
      firstName,
      lastName,
      phone,
    });
    sendSuccess(res, updated);
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      throw new BadRequestError("currentPassword and newPassword are required");
    await this.service.changePassword(userId, currentPassword, newPassword);
    sendMessage(res, "Password changed successfully");
  });
}
