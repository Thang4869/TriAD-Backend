import type {
  CreateNotificationData,
  NotificationRecord,
} from "./notification-models";

export interface INotificationsRepository {
  findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<NotificationRecord[]>;

  countByUser(userId: string): Promise<number>;

  findByIdAndUser(
    id: string,
    userId: string,
  ): Promise<NotificationRecord | null>;

  markAsRead(id: string): Promise<NotificationRecord>;
  markAllAsReadForUser(userId: string): Promise<number>;

  create(data: CreateNotificationData): Promise<NotificationRecord>;
}
