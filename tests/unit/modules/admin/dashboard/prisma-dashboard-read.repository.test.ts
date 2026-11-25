import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaDashboardReadRepository } from "@modules/admin/dashboard/infrastructure/repositories/prisma-dashboard-read.repository";

const mocks = vi.hoisted(() => ({
  orderHistoryProjection: { aggregate: vi.fn(), groupBy: vi.fn() },
  productCatalogProjection: { findMany: vi.fn() },
  adminDashboardProjection: { findUnique: vi.fn() },
  user: { count: vi.fn() },
  queryRaw: vi.fn(),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    orderHistoryProjection: mocks.orderHistoryProjection,
    productCatalogProjection: mocks.productCatalogProjection,
    adminDashboardProjection: mocks.adminDashboardProjection,
    user: mocks.user,
    $queryRaw: mocks.queryRaw,
  },
}));

describe("PrismaDashboardReadRepository", () => {
  const repository = new PrismaDashboardReadRepository();
  const sinceDate = new Date("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderHistoryProjection.aggregate.mockResolvedValue({
      _sum: { total: 2500 },
    });
    mocks.orderHistoryProjection.groupBy.mockResolvedValue([]);
    mocks.productCatalogProjection.findMany.mockResolvedValue([]);
    mocks.adminDashboardProjection.findUnique.mockResolvedValue(null);
    mocks.user.count.mockResolvedValue(0);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("returns the gross value and excludes cancelled orders", async () => {
    await expect(repository.getGrossOrderValue(sinceDate)).resolves.toBe(2500);
    expect(mocks.orderHistoryProjection.aggregate).toHaveBeenCalledWith({
      where: {
        placedAt: { gte: sinceDate },
        status: { not: "CANCELLED" },
      },
      _sum: { total: true },
    });
  });

  it("defaults gross order value to zero when the aggregate is null", async () => {
    mocks.orderHistoryProjection.aggregate.mockResolvedValue({
      _sum: { total: null },
    });
    await expect(repository.getGrossOrderValue(sinceDate)).resolves.toBe(0);
  });

  it("maps order status groups to status and count records", async () => {
    mocks.orderHistoryProjection.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { status: 3 } },
      { status: "DELIVERED", _count: { status: 8 } },
    ]);

    await expect(repository.getOrderStatusBreakdown()).resolves.toEqual([
      { status: "PENDING", count: 3 },
      { status: "DELIVERED", count: 8 },
    ]);
    expect(mocks.orderHistoryProjection.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      _count: { status: true },
      orderBy: { status: "asc" },
    });
  });

  it("maps daily gross order values and converts decimal totals", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        date: "2026-01-01",
        grossOrderValue: "1200",
        orderCount: 4,
      },
    ]);

    await expect(
      repository.getGrossOrderValueByDay(sinceDate),
    ).resolves.toEqual([
      {
        date: "2026-01-01",
        grossOrderValue: 1200,
        orderCount: 4,
      },
    ]);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRaw.mock.calls[0][0].join("")).toContain(
      'FROM "order_history_projection"',
    );
    expect(mocks.queryRaw.mock.calls[0].slice(1)).toEqual([sinceDate]);
  });

  it("returns an empty daily series when no rows exist", async () => {
    await expect(
      repository.getGrossOrderValueByDay(sinceDate),
    ).resolves.toEqual([]);
  });

  it("maps top-selling product rows and converts monetary totals", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        productId: "product-1",
        name: "Shirt",
        totalQuantitySold: 5,
        totalOrderValue: "5000",
      },
    ]);

    await expect(
      repository.getTopSellingProducts(10, sinceDate),
    ).resolves.toEqual([
      {
        productId: "product-1",
        name: "Shirt",
        totalQuantitySold: 5,
        totalOrderValue: 5000,
      },
    ]);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRaw.mock.calls[0][0].join("")).toContain(
      "jsonb_array_elements",
    );
    expect(mocks.queryRaw.mock.calls[0].slice(1)).toEqual([sinceDate, 10]);
  });

  it("returns an empty top-selling list when no rows exist", async () => {
    await expect(
      repository.getTopSellingProducts(5, sinceDate),
    ).resolves.toEqual([]);
  });

  it("maps low-stock products to the dashboard response shape", async () => {
    mocks.productCatalogProjection.findMany.mockResolvedValue([
      {
        productId: "product-1",
        name: "Shirt",
        stock: 2,
        slug: "shirt",
      },
    ]);

    await expect(repository.getLowStockProducts(3)).resolves.toEqual([
      { id: "product-1", name: "Shirt", stock: 2, slug: "shirt" },
    ]);
    expect(mocks.productCatalogProjection.findMany).toHaveBeenCalledWith({
      where: { isActive: true, stock: { lte: 3 } },
      select: { productId: true, name: true, stock: true, slug: true },
      orderBy: { stock: "asc" },
      take: 20,
    });
  });

  it("returns an empty low-stock list when no products match", async () => {
    await expect(repository.getLowStockProducts(0)).resolves.toEqual([]);
  });

  it("counts new users from the requested date", async () => {
    mocks.user.count.mockResolvedValue(6);

    await expect(repository.getNewUsersCount(sinceDate)).resolves.toBe(6);
    expect(mocks.user.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: sinceDate } },
    });
  });

  it("reads total users from the dashboard projection", async () => {
    mocks.adminDashboardProjection.findUnique.mockResolvedValue({
      totalUsers: 12,
    });

    await expect(repository.getTotalUsersCount()).resolves.toBe(12);
    expect(mocks.adminDashboardProjection.findUnique).toHaveBeenCalledWith({
      where: { id: "singleton" },
      select: { totalUsers: true },
    });
  });

  it("defaults total users to zero when the dashboard projection is absent", async () => {
    await expect(repository.getTotalUsersCount()).resolves.toBe(0);
  });

  it("reads total products from the dashboard projection", async () => {
    mocks.adminDashboardProjection.findUnique.mockResolvedValue({
      totalProducts: 9,
    });

    await expect(repository.getTotalProductsCount()).resolves.toBe(9);
    expect(mocks.adminDashboardProjection.findUnique).toHaveBeenCalledWith({
      where: { id: "singleton" },
      select: { totalProducts: true },
    });
  });

  it("defaults total products to zero when the dashboard projection is absent", async () => {
    await expect(repository.getTotalProductsCount()).resolves.toBe(0);
  });
});
