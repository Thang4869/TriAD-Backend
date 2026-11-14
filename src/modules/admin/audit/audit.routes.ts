import { Router } from "express";
import {
  authMiddleware,
  auditDeniedAdminAttempt,
  auditController,
} from "@/container";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { auditQuerySchema } from "./dto/audit.dto";

const router = Router();
router.use(
  authMiddleware,
  auditDeniedAdminAttempt("AUDIT_LOG_QUERY"),
  requireAdmin,
);
router.get("/", validate(auditQuerySchema), auditController.list);

export { router as auditRoutes };
