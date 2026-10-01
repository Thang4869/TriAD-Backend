import prisma from "@core/database/prisma";
import { OrderStatus } from "@modules/orders/domain/order-status";
import type {
  DashboardLowStockProduct,
  DashboardOrderStatusCount,
  DashboardReadPort,
  DashboardTopSellingProduct,
  GrossOrderValueByDay,
} from "../../application/dashboard-read.port";

export class PrismaDashboardReadRepository implements DashboardReadPort {
  async getGrossOrderValue(sinceDate: Date): Promise<number> {
    const result = await prisma.orderHistoryProjection.aggregate({
      where: {
        placedAt: { gte: sinceDate },
        status: { not: "CANCELLED" },
      },
      _sum: { total: true },
    });

    return result._sum.total ?? 0;
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
    return prisma.$queryRaw<GrossOrderValueByDay[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "placedAt"), 'YYYY-MM-DD') AS date,
        COALESCE(SUM("total"), 0)::float AS "grossOrderValue",
        COUNT(*)::int AS "orderCount"
      FROM "order_history_projection"
      WHERE "placedAt" >= ${sinceDate}
        AND "status" != 'CANCELLED'
      GROUP BY DATE_TRUNC('day', "placedAt")
      ORDER BY DATE_TRUNC('day', "placedAt") ASC
    `;
  }

  async getTopSellingProducts(
    limit: number,
    sinceDate: Date,
  ): Promise<DashboardTopSellingProduct[]> {
    return prisma.$queryRaw<DashboardTopSellingProduct[]>`
      SELECT
        item->>'productId' AS "productId",
        item->>'productName' AS "name",
        SUM((item->>'quantity')::int)::int AS "totalQuantitySold",
        SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric)::float
          AS "totalOrderValue"
      FROM "order_history_projection" order_projection
      CROSS JOIN LATERAL jsonb_array_elements(order_projection."items") AS item
      WHERE order_projection."placedAt" >= ${sinceDate}
        AND order_projection."status" != 'CANCELLED'
      GROUP BY item->>'productId', item->>'productName'
      ORDER BY "totalQuantitySold" DESC
      LIMIT ${limit}
    `;
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
