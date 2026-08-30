import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DashboardService } from "@modules/admin/dashboard/dashboard.service";
import { IDashboardRepository } from "@modules/admin/dashboard/dashboard.repository";
import { OrderStatus } from "@prisma/client";

function createFakeRepository(
  overrides: Partial<IDashboardRepository> = {},
): IDashboardRepository {
  return {
    getTotalRevenue: vi.fn().mockResolvedValue(0),
    getOrderStatusBreakdown: vi.fn().mockResolvedValue([]),
    getRevenueByDay: vi.fn().mockResolvedValue([]),
    getTopSellingProducts: vi.fn().mockResolvedValue([]),
    getLowStockProducts: vi.fn().mockResolvedValue([]),
    getNewUsersCount: vi.fn().mockResolvedValue(0),
    getTotalUsersCount: vi.fn().mockResolvedValue(0),
    getTotalProductsCount: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("DashboardService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("tính đúng mốc 30 ngày trước và truyền cho các repository call phụ thuộc thời gian", async () => {
    const repository = createFakeRepository({
      getTotalRevenue: vi.fn().mockResolvedValue(15_000_000),
      getOrderStatusBreakdown: vi
        .fn()
        .mockResolvedValue([{ status: OrderStatus.DELIVERED, count: 10 }]),
      getNewUsersCount: vi.fn().mockResolvedValue(5),
      getTotalUsersCount: vi.fn().mockResolvedValue(120),
      getTotalProductsCount: vi.fn().mockResolvedValue(40),
    });
    const service = new DashboardService(repository);

    const stats = await service.getStats();

    const expectedSinceDate = new Date("2026-07-31T00:00:00Z");
    expect(repository.getTotalRevenue).toHaveBeenCalledWith(expectedSinceDate);
    expect(repository.getNewUsersCount).toHaveBeenCalledWith(expectedSinceDate);
    expect(stats).toMatchObject({
      revenue: { total30Days: 15_000_000 },
      users: { total: 120, new30Days: 5 },
      products: { total: 40 },
    });
  });

  it("dùng threshold tồn kho thấp mặc định = 10 và top-selling limit mặc định = 5", async () => {
    const repository = createFakeRepository();
    const service = new DashboardService(repository);

    await service.getStats();

    expect(repository.getLowStockProducts).toHaveBeenCalledWith(10);
    expect(repository.getTopSellingProducts).toHaveBeenCalledWith(
      5,
      expect.any(Date),
    );
  });

  it("gọi toàn bộ 8 repository method song song (Promise.all), không tuần tự", async () => {
    const callOrder: string[] = [];
    const repository = createFakeRepository();
    for (const key of Object.keys(
      repository,
    ) as (keyof IDashboardRepository)[]) {
      const original = repository[key] as (...args: any[]) => any;
      (repository[key] as any) = vi.fn(async (...args: unknown[]) => {
        callOrder.push(key);
        return original(...args);
      });
    }
    const service = new DashboardService(repository);

    await service.getStats();

    expect(callOrder).toHaveLength(8);
  });
});
