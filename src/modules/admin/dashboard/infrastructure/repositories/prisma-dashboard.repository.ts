import prisma from "@core/database/prisma";
import { OrderStatus } from "@modules/orders/domain/order-status";

import type {
  IDashboardRepository,
  GrossOrderValueByDay,
  LowStockProduct,
  OrderStatusCount,
  TopSellingProduct,
} from "../../application/ports/dashboard.repository.port";

// ---------- Prisma implementation ----------

export class PrismaDashboardRepository implements IDashboardRepository {
  async getGrossOrderValue(sinceDate: Date): Promise<number> {
    const result = await prisma.order.aggregate({
      where: {
        createdAt: { gte: sinceDate },
        status: { notIn: [OrderStatus.CANCELLED] },
      },
      _sum: { total: true },
    });
    return result._sum.total ?? 0;
  }

  async getOrderStatusBreakdown(): Promise<OrderStatusCount[]> {
    const groups = await prisma.order.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    return groups.map((g) => ({ status: g.status, count: g._count.status }));
  }

  async getGrossOrderValueByDay(
    sinceDate: Date,
  ): Promise<GrossOrderValueByDay[]> {
    return prisma.$queryRaw<GrossOrderValueByDay[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS date,
        COALESCE(SUM("total"), 0)::float AS "grossOrderValue",
        COUNT(*)::int AS "orderCount"
      FROM "orders"
      WHERE "createdAt" >= ${sinceDate}
        AND "status" != 'CANCELLED'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY DATE_TRUNC('day', "createdAt") ASC
    `;
  }

  async getTopSellingProducts(
    limit: number,
    sinceDate: Date,
  ): Promise<TopSellingProduct[]> {
    return prisma.$queryRaw<TopSellingProduct[]>`
      SELECT
        oi."productId" AS "productId",
        p."name" AS "name",
        SUM(oi."quantity")::int AS "totalQuantitySold",
        SUM(oi."total")::float AS "totalOrderValue"
      FROM "order_items" oi
      INNER JOIN "orders" o ON o."id" = oi."orderId"
      INNER JOIN "products" p ON p."id" = oi."productId"
      WHERE o."createdAt" >= ${sinceDate}
        AND o."status" != 'CANCELLED'
      GROUP BY oi."productId", p."name"
      ORDER BY "totalQuantitySold" DESC
      LIMIT ${limit}
    `;
  }

  async getLowStockProducts(threshold: number): Promise<LowStockProduct[]> {
    return prisma.product.findMany({
      where: { isActive: true, stock: { lte: threshold } },
      select: { id: true, name: true, stock: true, slug: true },
      orderBy: { stock: "asc" },
      take: 20,
    });
  }

  async getNewUsersCount(sinceDate: Date): Promise<number> {
    return prisma.user.count({ where: { createdAt: { gte: sinceDate } } });
  }

  async getTotalUsersCount(): Promise<number> {
    return prisma.user.count();
  }

  async getTotalProductsCount(): Promise<number> {
    return prisma.product.count({ where: { isActive: true } });
  }
}
