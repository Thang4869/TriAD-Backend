import { Request, Response } from "express";
import { INotificationsService } from "./notifications.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess } from "@shared/utils/api-response";

export class NotificationsController {
  constructor(private readonly service: INotificationsService) {}

  getNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await this.service.getNotifications(userId, page, limit);
    sendSuccess(res, result);
  });

  markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { id } = req.params;
    const updated = await this.service.markAsRead(id, userId);
    sendSuccess(res, updated);
  });

  markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const result = await this.service.markAllAsRead(userId);
    sendSuccess(res, result);
  });
}
