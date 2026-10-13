import prisma from "@core/database/prisma";
import type {
  OrderHistoryReadPort,
  OrderHistoryView,
} from "../../application/order-history-read.port";
import { toSafeMoneyNumber } from "@shared/infrastructure/money-number";
import { parseOrderHistoryItems } from "./parse-order-history-items";

export class PrismaOrderHistoryReadRepository implements OrderHistoryReadPort {
  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderHistoryView[]> {
    const rows = await prisma.orderHistoryProjection.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      skip,
      take,
    });

    return rows.map((row) => this.toOrderHistoryView(row));
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.orderHistoryProjection.count({
      where: { userId },
    });
  }

  async findByIdAndUser(
    orderId: string,
    userId: string,
  ): Promise<OrderHistoryView | null> {
    const row = await prisma.orderHistoryProjection.findFirst({
      where: {
        orderId,
        userId,
      },
    });

    if (!row) {
      return null;
    }

    return this.toOrderHistoryView(row);
  }

  private toOrderHistoryView(
    row: NonNullable<
      Awaited<ReturnType<typeof prisma.orderHistoryProjection.findFirst>>
    >,
  ): OrderHistoryView {
    const items = parseOrderHistoryItems(row.items);

    return {
      orderId: row.orderId,
      userId: row.userId,
      orderNumber: row.orderNumber,
      status: row.status,
      paymentStatus: row.paymentStatus,
      subtotal: toSafeMoneyNumber(row.subtotal),
      tax: toSafeMoneyNumber(row.tax),
      shippingFee: toSafeMoneyNumber(row.shippingFee),
      total: toSafeMoneyNumber(row.total),
      items,
      placedAt: row.placedAt,
      updatedAt: row.updatedAt,
    };
  }
}
