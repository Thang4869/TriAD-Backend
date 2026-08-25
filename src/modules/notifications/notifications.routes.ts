import { Router } from "express";
import { NotificationsController } from "./notifications.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import {
  getNotificationsQuerySchema,
  markAsReadParamsSchema,
} from "./dto/notifications.dto";

const router = Router();
const controller = new NotificationsController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 */
router.get(
    "/", 
    validate(getNotificationsQuerySchema), 
    controller.getNotifications.bind(controller)
);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification updated
 */
router.put(
  "/:id/read",
  validate(markAsReadParamsSchema),
  controller.markAsRead.bind(controller)
);

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.put(
    "/read-all", 
    controller.markAllAsRead.bind(controller)
);

export { router as notificationRoutes };
