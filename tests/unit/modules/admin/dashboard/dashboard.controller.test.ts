import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { DashboardController } from "@modules/admin/dashboard/dashboard.controller";
import type { IDashboardService } from "@modules/admin/dashboard/dashboard.service";

describe("DashboardController", () => {
  it("loads dashboard statistics and sends a success response", async () => {
    const stats = { users: 12, orders: 8, revenue: 125000 };
    const service = { getStats: vi.fn().mockResolvedValue(stats) } as unknown as IDashboardService;
    const controller = new DashboardController(service);
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await controller.getStats({} as Request, res, vi.fn());

    expect(service.getStats).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: stats,
    }));
  });

  it("forwards service failures to async error handling", async () => {
    const error = new Error("dashboard unavailable");
    const service = { getStats: vi.fn().mockRejectedValue(error) } as unknown as IDashboardService;
    const controller = new DashboardController(service);
    const next = vi.fn();

    controller.getStats({} as Request, {} as Response, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
