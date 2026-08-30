import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationsService } from "@modules/notifications/notifications.service";
import { INotificationsRepository } from "@modules/notifications/notifications.repository";
import { NotFoundError } from "@shared/utils/errors";
import { NotificationType } from "@shared/constants/notification-type.enum";

function createFakeRepository(
  overrides: Partial<INotificationsRepository> = {},
): INotificationsRepository {
  return {
    findByUser: vi.fn().mockResolvedValue([]),
    countByUser: vi.fn().mockResolvedValue(0),
    findByIdAndUser: vi.fn().mockResolvedValue(null),
    markAsRead: vi.fn(),
    markAllAsReadForUser: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    ...overrides,
  };
}

describe("NotificationsService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getNotifications", () => {
    it("tính đúng skip theo trang và trả về totalPages chính xác", async () => {
      const repository = createFakeRepository({
        findByUser: vi.fn().mockResolvedValue([
          {
            id: "n1",
            userId: "user-1",
            title: "Hi",
            message: "msg",
            type: "info",
            read: false,
          },
        ]),
        countByUser: vi.fn().mockResolvedValue(25),
      });
      const service = new NotificationsService(repository);

      const result = await service.getNotifications("user-1", 2, 10);

      expect(repository.findByUser).toHaveBeenCalledWith("user-1", 10, 10);
      expect(result).toMatchObject({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it("dùng PAGINATION_DEFAULTS khi không truyền page/limit", async () => {
      const repository = createFakeRepository();
      const service = new NotificationsService(repository);

      await service.getNotifications("user-1");

      expect(repository.findByUser).toHaveBeenCalledWith("user-1", 0, 10);
    });
  });

  describe("markAsRead", () => {
    it("ném NotFoundError khi notification không thuộc về user (chặn IDOR)", async () => {
      const repository = createFakeRepository({
        findByIdAndUser: vi.fn().mockResolvedValue(null),
      });
      const service = new NotificationsService(repository);

      await expect(service.markAsRead("n1", "user-1")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repository.markAsRead).not.toHaveBeenCalled();
    });

    it("đánh dấu đã đọc khi notification thuộc về user", async () => {
      const repository = createFakeRepository({
        findByIdAndUser: vi.fn().mockResolvedValue({ id: "n1" }),
        markAsRead: vi.fn().mockResolvedValue({ id: "n1", read: true }),
      });
      const service = new NotificationsService(repository);

      const result = await service.markAsRead("n1", "user-1");

      expect(repository.markAsRead).toHaveBeenCalledWith("n1");
      expect(result).toMatchObject({ read: true });
    });
  });

  describe("markAllAsRead", () => {
    it("trả về count từ repository", async () => {
      const repository = createFakeRepository({
        markAllAsReadForUser: vi.fn().mockResolvedValue(7),
      });
      const service = new NotificationsService(repository);

      const result = await service.markAllAsRead("user-1");

      expect(result).toEqual({ count: 7 });
    });
  });

  describe("createNotification", () => {
    it("mặc định type = NotificationType.INFO khi không truyền", async () => {
      const repository = createFakeRepository({
        create: vi.fn().mockResolvedValue({}),
      });
      const service = new NotificationsService(repository);

      await service.createNotification("user-1", "Title", "Message");

      expect(repository.create).toHaveBeenCalledWith({
        userId: "user-1",
        title: "Title",
        message: "Message",
        type: NotificationType.INFO,
      });
    });

    it("dùng type được truyền vào thay vì default", async () => {
      const repository = createFakeRepository({
        create: vi.fn().mockResolvedValue({}),
      });
      const service = new NotificationsService(repository);

      await service.createNotification(
        "user-1",
        "T",
        "M",
        NotificationType.ORDER_UPDATE,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.ORDER_UPDATE }),
      );
    });
  });
});
