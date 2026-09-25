import prisma from "@core/database/prisma";
import {
  CreateNotificationData,
  NotificationRecord,
} from "./application/ports/notification-models";

// ---------- Repository contract ----------

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

// ---------- Prisma implementation ----------

export class PrismaNotificationsRepository implements INotificationsRepository {
  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<NotificationRecord[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId } });
  }

  async findByIdAndUser(
    id: string,
    userId: string,
  ): Promise<NotificationRecord | null> {
    return prisma.notification.findFirst({ where: { id, userId } });
  }

  async markAsRead(id: string): Promise<NotificationRecord> {
    return prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsReadForUser(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return result.count;
  }

  async create(data: CreateNotificationData): Promise<NotificationRecord> {
    return prisma.notification.create({
      data: { ...data, read: false },
    });
  }
}
