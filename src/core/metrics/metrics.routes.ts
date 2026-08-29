import { Router, Request, Response } from "express";
import { metricsRegistry } from "./metrics.registry";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  res.set("Content-Type", metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

export { router as metricsRoutes };