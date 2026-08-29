import { Request, Response } from "express";
import { IDashboardService, DashboardService } from "./dashboard.service";
import { asyncHandler } from "@shared/utils/async-handler";

export class DashboardController {
  constructor(
    private readonly service: IDashboardService = new DashboardService(),
  ) {}

  getStats = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await this.service.getStats();
    res.json({ success: true, data: stats });
  });
}
