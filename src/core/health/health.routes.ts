import { Router, type Request, type Response } from "express";
import type { HealthService } from "./health.service";
import { asyncHandler } from "@shared/utils/async-handler";

type ReadinessService = Pick<HealthService, "getReadiness">;

export function createHealthRoutes(healthService: ReadinessService): Router {
  const router = Router();

  router.get("/live", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "up",
      timestamp: new Date().toISOString(),
    });
  });

  router.get(
    "/ready",
    asyncHandler(async (_req: Request, res: Response) => {
      const report = await healthService.getReadiness();

      res.status(report.status === "up" ? 200 : 503).json(report);
    }),
  );

  return router;
}
