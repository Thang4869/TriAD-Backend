import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import { OrderStatus } from "@modules/orders/domain/order-status";
import type {
  DashboardLowStockProduct,
  DashboardOrderStatusCount,
  DashboardReadPort,
  DashboardTopSellingProduct,
  GrossOrderValueByDay,
} from "../../application/dashboard-read.port";
import { toSafeMoneyNumber } from "@shared/infrastructure/money-number";

export class PrismaDashboardReadRepository implements DashboardReadPort {
  async getGrossOrderValue(sinceDate: Date): Promise<number> {
    const result = await prisma.orderHistoryProjection.aggregate({
      where: {
        placedAt: { gte: sinceDate },
        status: { not: "CANCELLED" },
      },
      _sum: { total: true },
    });

    return result._sum.total == null ? 0 : toSafeMoneyNumber(result._sum.total);
  }

  async getOrderStatusBreakdown(): Promise<DashboardOrderStatusCount[]> {
    const groups = await prisma.orderHistoryProjection.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    return groups.map((group) => ({
      status: group.status as OrderStatus,
      count: group._count.status,
    }));
  }

  async getGrossOrderValueByDay(
    sinceDate: Date,
  ): Promise<GrossOrderValueByDay[]> {
    const rows = await prisma.$queryRaw<
      Array<GrossOrderValueByDay & { grossOrderValue: Prisma.Decimal }>
    >`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "placedAt"), 'YYYY-MM-DD') AS date,
        COALESCE(SUM("total"), 0)::numeric AS "grossOrderValue",
        COUNT(*)::int AS "orderCount"
      FROM "order_history_projection"
      WHERE "placedAt" >= ${sinceDate}
        AND "status" != 'CANCELLED'
      GROUP BY DATE_TRUNC('day', "placedAt")
      ORDER BY DATE_TRUNC('day', "placedAt") ASC
    `;
    return rows.map((row) => ({
      ...row,
      grossOrderValue: toSafeMoneyNumber(row.grossOrderValue),
    }));
  }

  async getTopSellingProducts(
    limit: number,
    sinceDate: Date,
  ): Promise<DashboardTopSellingProduct[]> {
    const rows = await prisma.$queryRaw<
      Array<DashboardTopSellingProduct & { totalOrderValue: Prisma.Decimal }>
    >`
      SELECT
        item->>'productId' AS "productId",
        item->>'productName' AS "name",
        SUM((item->>'quantity')::int)::int AS "totalQuantitySold",
        SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric)::numeric
          AS "totalOrderValue"
      FROM "order_history_projection" order_projection
      CROSS JOIN LATERAL jsonb_array_elements(order_projection."items") AS item
      WHERE order_projection."placedAt" >= ${sinceDate}
        AND order_projection."status" != 'CANCELLED'
      GROUP BY item->>'productId', item->>'productName'
      ORDER BY "totalQuantitySold" DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      ...row,
      totalOrderValue: toSafeMoneyNumber(row.totalOrderValue),
    }));
  }

  async getLowStockProducts(
    threshold: number,
  ): Promise<DashboardLowStockProduct[]> {
    return prisma.productCatalogProjection
      .findMany({
        where: { isActive: true, stock: { lte: threshold } },
        select: { productId: true, name: true, stock: true, slug: true },
        orderBy: { stock: "asc" },
        take: 20,
      })
      .then((products) =>
        products.map((product) => ({
          id: product.productId,
          name: product.name,
          stock: product.stock,
          slug: product.slug,
        })),
      );
  }

  async getNewUsersCount(sinceDate: Date): Promise<number> {
    return prisma.user.count({ where: { createdAt: { gte: sinceDate } } });
  }

  async getTotalUsersCount(): Promise<number> {
    const projection = await prisma.adminDashboardProjection.findUnique({
      where: { id: "singleton" },
      select: { totalUsers: true },
    });

    return projection?.totalUsers ?? 0;
  }

  async getTotalProductsCount(): Promise<number> {
    const projection = await prisma.adminDashboardProjection.findUnique({
      where: { id: "singleton" },
      select: { totalProducts: true },
    });

    return projection?.totalProducts ?? 0;
  }
}
