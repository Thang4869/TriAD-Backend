import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaNotificationsRepository } from "@modules/notifications/infrastructure/repositories/prisma-notifications.repository";

const mocks = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@core/database/prisma", () => ({
  default: { notification: mocks.notification },
}));

const notification = {
  id: "notification-1",
  userId: "user-1",
  type: "ORDER_STATUS",
  title: "Order updated",
  message: "Your order has shipped",
  read: false,
  idempotencyKey: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("PrismaNotificationsRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notification.findMany.mockResolvedValue([notification]);
    mocks.notification.count.mockResolvedValue(1);
    mocks.notification.findFirst.mockResolvedValue(notification);
    mocks.notification.update.mockResolvedValue({
      ...notification,
      read: true,
    });
    mocks.notification.updateMany.mockResolvedValue({ count: 3 });
    mocks.notification.create.mockResolvedValue(notification);
    mocks.notification.upsert.mockResolvedValue(notification);
  });

  it("lists notifications for one user with descending pagination", async () => {
    await expect(
      new PrismaNotificationsRepository().findByUser("user-1", 10, 5),
    ).resolves.toEqual([notification]);

    expect(mocks.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 5,
    });
  });

  it("counts notifications for a user", async () => {
    await expect(
      new PrismaNotificationsRepository().countByUser("user-1"),
    ).resolves.toBe(1);
    expect(mocks.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("finds a notification only when both id and user match", async () => {
    await expect(
      new PrismaNotificationsRepository().findByIdAndUser(
        "notification-1",
        "user-1",
      ),
    ).resolves.toEqual(notification);

    expect(mocks.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "notification-1", userId: "user-1" },
    });
  });

  it("marks one notification as read", async () => {
    await expect(
      new PrismaNotificationsRepository().markAsRead("notification-1"),
    ).resolves.toEqual({ ...notification, read: true });

    expect(mocks.notification.update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: { read: true },
    });
  });

  it("marks all unread notifications for a user as read and returns the count", async () => {
    await expect(
      new PrismaNotificationsRepository().markAllAsReadForUser("user-1"),
    ).resolves.toBe(3);

    expect(mocks.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
      data: { read: true },
    });
  });

  it("creates a notification without an idempotency key", async () => {
    const data = {
      userId: "user-1",
      type: "ORDER_STATUS",
      title: "Order updated",
      message: "Your order has shipped",
    };

    await expect(
      new PrismaNotificationsRepository().create(data as never),
    ).resolves.toEqual(notification);

    expect(mocks.notification.create).toHaveBeenCalledWith({
      data: { ...data, read: false },
    });
    expect(mocks.notification.upsert).not.toHaveBeenCalled();
  });

  it("upserts a notification when an idempotency key is supplied", async () => {
    const data = {
      userId: "user-1",
      type: "ORDER_STATUS",
      title: "Order updated",
      message: "Your order has shipped",
      idempotencyKey: "order-1:SHIPPED",
    };

    await expect(
      new PrismaNotificationsRepository().create(data as never),
    ).resolves.toEqual(notification);

    expect(mocks.notification.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: data.idempotencyKey },
      create: { ...data, read: false },
      update: {},
    });
    expect(mocks.notification.create).not.toHaveBeenCalled();
  });
});
