import { Router } from "express";
import { authMiddleware } from "@/container";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { dashboardController } from "@/container";

const router = Router();
router.use(authMiddleware, requireAdmin);

router.get("/stats", dashboardController.getStats);

export { router as dashboardRoutes };
