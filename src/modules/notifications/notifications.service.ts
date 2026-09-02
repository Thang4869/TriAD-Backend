import { NotFoundError } from "@shared/utils/errors";
import {
  PAGINATION_DEFAULTS,
  resolvePagination,
} from "@shared/constants/pagination.constant";
import { NotificationType } from "@shared/constants/notification-type.enum";
import {
  INotificationsRepository,
  PrismaNotificationsRepository,
} from "./notifications.repository";

export interface INotificationsService {
  getNotifications(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<unknown>;
  markAsRead(notificationId: string, userId: string): Promise<unknown>;
  markAllAsRead(userId: string): Promise<{ count: number }>;
  createNotification(
    userId: string,
    title: string,
    message: string,
    type?: NotificationType,
  ): Promise<unknown>;
}

export class NotificationsService implements INotificationsService {
  constructor(private readonly repository: INotificationsRepository) {}

  async getNotifications(
    userId: string,
    page: number = PAGINATION_DEFAULTS.DEFAULT_PAGE,
    limit: number = PAGINATION_DEFAULTS.STANDARD_LIMIT,
  ) {
    const { safeLimit, skip } = resolvePagination(page, limit);

    const [notifications, total] = await Promise.all([
      this.repository.findByUser(userId, skip, safeLimit),
      this.repository.countByUser(userId),
    ]);

    return {
      notifications,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.repository.findByIdAndUser(
      notificationId,
      userId,
    );
    if (!notification) {
      throw new NotFoundError("Notification not found");
    }
    return this.repository.markAsRead(notificationId);
  }

  async markAllAsRead(userId: string) {
    const count = await this.repository.markAllAsReadForUser(userId);
    return { count };
  }

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
  ) {
    return this.repository.create({ userId, title, message, type });
  }
}
