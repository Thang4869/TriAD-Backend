import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { notificationsController } from "@/container";
import {
  getNotificationsQuerySchema,
  markAsReadParamsSchema,
} from "./dto/notifications.dto";

const router = Router();
router.use(authMiddleware);

router.get(
  "/",
  validate(getNotificationsQuerySchema),
  notificationsController.getNotifications,
);
router.put(
  "/:id/read",
  validate(markAsReadParamsSchema),
  notificationsController.markAsRead,
);
router.put("/read-all", notificationsController.markAllAsRead);

export { router as notificationRoutes };
