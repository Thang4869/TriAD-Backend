import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { NotificationsController } from "@modules/notifications/notifications.controller";
import type { INotificationsService } from "@modules/notifications/notifications.service";

function resMock() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function reqMock(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    user: { id: "u1" },
    ...overrides,
  } as unknown as Request;
}

describe("NotificationsController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gets notifications with parsed pagination", async () => {
    const result = {
      notifications: [],
      total: 0,
      page: 2,
      limit: 5,
      totalPages: 0,
    };
    const service = {
      getNotifications: vi.fn().mockResolvedValue(result),
    } as unknown as INotificationsService;
    const res = resMock();

    await new NotificationsController(service).getNotifications(
      reqMock({ query: { page: "2", limit: "5" } }),
      res,
      vi.fn(),
    );

    expect(service.getNotifications).toHaveBeenCalledWith("u1", 2, 5);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it("passes undefined pagination when query parameters are absent", async () => {
    const service = {
      getNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
    } as unknown as INotificationsService;

    await new NotificationsController(service).getNotifications(
      reqMock(),
      resMock(),
      vi.fn(),
    );

    expect(service.getNotifications).toHaveBeenCalledWith(
      "u1",
      undefined,
      undefined,
    );
  });

  it("marks one notification as read for the authenticated user", async () => {
    const notification = { id: "n1", isRead: true };
    const service = {
      markAsRead: vi.fn().mockResolvedValue(notification),
    } as unknown as INotificationsService;
    const res = resMock();

    await new NotificationsController(service).markAsRead(
      reqMock({ params: { id: "n1" } }),
      res,
      vi.fn(),
    );

    expect(service.markAsRead).toHaveBeenCalledWith("n1", "u1");
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: notification,
    });
  });

  it("marks all notifications as read for the authenticated user", async () => {
    const result = { count: 3 };
    const service = {
      markAllAsRead: vi.fn().mockResolvedValue(result),
    } as unknown as INotificationsService;
    const res = resMock();

    await new NotificationsController(service).markAllAsRead(
      reqMock(),
      res,
      vi.fn(),
    );

    expect(service.markAllAsRead).toHaveBeenCalledWith("u1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });
});
