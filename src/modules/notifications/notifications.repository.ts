import prisma from "@core/database/prisma";
import { Notification } from "@prisma/client";

export interface CreateNotificationData {
  userId: string;
  title: string;
  message: string;
  type: string;
}

// ---------- Repository contract ----------

export interface INotificationsRepository {
  findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<Notification[]>;
  countByUser(userId: string): Promise<number>;
  findByIdAndUser(id: string, userId: string): Promise<Notification | null>;
  markAsRead(id: string): Promise<Notification>;
  markAllAsReadForUser(userId: string): Promise<number>;
  create(data: CreateNotificationData): Promise<Notification>;
}

// ---------- Prisma implementation ----------

export class PrismaNotificationsRepository implements INotificationsRepository {
  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<Notification[]> {
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
  ): Promise<Notification | null> {
    return prisma.notification.findFirst({ where: { id, userId } });
  }

  async markAsRead(id: string): Promise<Notification> {
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

  async create(data: CreateNotificationData): Promise<Notification> {
    return prisma.notification.create({
      data: { ...data, read: false },
    });
  }
}
