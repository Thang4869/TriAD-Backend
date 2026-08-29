import { Router, Request, Response } from "express";
import { HealthService } from "./health.service";
import { asyncHandler } from "@shared/utils/async-handler";

const router = Router();
const healthService = new HealthService();

router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "up", timestamp: new Date().toISOString() });
});

router.get(
  "/ready",
  asyncHandler(async (_req: Request, res: Response) => {
    const report = await healthService.getReadiness();
    const httpStatus = report.status === "up" ? 200 : 503;
    res.status(httpStatus).json(report);
  }),
);

export { router as healthRoutes };
