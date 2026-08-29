import { Request, Response } from "express";
import { INotificationsService, NotificationsService } from "./notifications.service";
import { asyncHandler } from "@shared/utils/async-handler";

export class NotificationsController {
  constructor(
    private readonly service: INotificationsService = new NotificationsService(),
  ) {}

  getNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await this.service.getNotifications(userId, page, limit);
    res.json({ success: true, data: result });
  });

  markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const updated = await this.service.markAsRead(id, userId);
    res.json({ success: true, data: updated });
  });

  markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await this.service.markAllAsRead(userId);
    res.json({ success: true, data: result });
  });
}