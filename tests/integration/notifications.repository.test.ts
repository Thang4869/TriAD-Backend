import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaNotificationsRepository } from "@modules/notifications/notifications.repository";

describe("PrismaNotificationsRepository (integration)", () => {
  const repository = new PrismaNotificationsRepository();
  let userId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `notif-repo-${Date.now()}@test.com`,
        password: "h",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });
    userId = user.id;
  });

  it("create() mặc định read=false", async () => {
    const notification = await repository.create({
      userId,
      title: "T",
      message: "M",
      type: "info",
    });
    expect(notification.read).toBe(false);
  });

  it("findByUser trả sắp xếp mới nhất trước, countByUser đếm đúng số lượng", async () => {
    await repository.create({
      userId,
      title: "T1",
      message: "M1",
      type: "info",
    });
    await new Promise((r) => setTimeout(r, 10));
    await repository.create({
      userId,
      title: "T2",
      message: "M2",
      type: "info",
    });

    const list = await repository.findByUser(userId, 0, 10);
    const count = await repository.countByUser(userId);

    expect(list[0].title).toBe("T2");
    expect(count).toBe(2);
  });

  it("findByIdAndUser trả null khi notification thuộc về user khác (chặn IDOR ở tầng data)", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `notif-other-${Date.now()}@test.com`,
        password: "h",
        firstName: "C",
        lastName: "D",
        isVerified: true,
      },
    });
    const notification = await repository.create({
      userId: otherUser.id,
      title: "T",
      message: "M",
      type: "info",
    });

    await expect(
      repository.findByIdAndUser(notification.id, userId),
    ).resolves.toBeNull();
  });

  it("markAsRead cập nhật read=true", async () => {
    const notification = await repository.create({
      userId,
      title: "T",
      message: "M",
      type: "info",
    });

    const updated = await repository.markAsRead(notification.id);

    expect(updated.read).toBe(true);
  });

  it("markAllAsReadForUser chỉ cập nhật notification chưa đọc, trả về đúng count", async () => {
    const n1 = await repository.create({
      userId,
      title: "T1",
      message: "M1",
      type: "info",
    });
    await repository.create({
      userId,
      title: "T2",
      message: "M2",
      type: "info",
    });
    await repository.markAsRead(n1.id);

    const count = await repository.markAllAsReadForUser(userId);

    expect(count).toBe(1);
  });
});
