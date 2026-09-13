import { Request, Response } from "express";
import { IDashboardService } from "./dashboard.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess } from "@shared/utils/api-response";

export class DashboardController {
  constructor(private readonly service: IDashboardService) {}

  getStats = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await this.service.getStats();
    sendSuccess(res, stats);
  });
}
