import prisma from "@core/database/prisma";

export class NotificationsService {
  async getNotifications(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return {
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });
    if (!notification) {
      throw new Error("Notification not found");
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: { read: true },
    });
    return { count: result.count };
  }

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: string = "info",
  ) {
    return prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        read: false,
      },
    });
  }
}
