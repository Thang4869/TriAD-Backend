import { Router } from "express";
import { DashboardController } from "./dashboard.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";

const router = Router();
const controller = new DashboardController();

router.use(authMiddleware, requireAdmin);

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: Get admin dashboard overview stats (revenue, orders, top products)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *       403:
 *         description: Admin access required
 */
router.get("/stats", controller.getStats.bind(controller));

export { router as dashboardRoutes };