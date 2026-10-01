import prisma from "@core/database/prisma";
import { OrderStatus } from "../../domain/order-status";
import type {
  OrderHistoryItemView,
  OrderHistoryReadPort,
  OrderHistoryView,
} from "../../application/order-history-read.port";

type ProjectionItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

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
    const items = row.items as unknown as ProjectionItem[];

    const mappedItems: OrderHistoryItemView[] = items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    return {
      orderId: row.orderId,
      userId: row.userId,
      orderNumber: row.orderNumber,
      status: row.status as OrderStatus,
      paymentStatus: row.paymentStatus,
      subtotal: row.subtotal,
      tax: row.tax,
      shippingFee: row.shippingFee,
      total: row.total,
      items: mappedItems,
      placedAt: row.placedAt,
      updatedAt: row.updatedAt,
    };
  }
}
