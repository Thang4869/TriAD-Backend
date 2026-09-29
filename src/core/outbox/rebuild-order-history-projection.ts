import type { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_BATCH_SIZE = 100;

type RebuildOrderHistoryProjectionDb = Pick<
  PrismaClient,
  "order" | "orderHistoryProjection" | "$transaction"
>;

export async function rebuildOrderHistoryProjection(
  db: RebuildOrderHistoryProjectionDb,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  let cursor: string | undefined;
  let processed = 0;

  let hasMore = true;

  while (hasMore) {
    const orders = await db.order.findMany({
      take: batchSize,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { id: "asc" },
      include: {
        items: true,
      },
    });

    if (orders.length === 0) {
      hasMore = false;
      continue;
    }

    const operations = orders.map((order) =>
      db.orderHistoryProjection.upsert({
        where: {
          orderId: order.id,
        },
        create: {
          orderId: order.id,
          userId: order.userId,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotal: order.subtotal,
          tax: order.tax,
          shippingFee: order.shippingFee,
          total: order.total,
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.price,
          })) as Prisma.InputJsonValue,
          placedAt: order.createdAt,
        },
        update: {
          userId: order.userId,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotal: order.subtotal,
          tax: order.tax,
          shippingFee: order.shippingFee,
          total: order.total,
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.price,
          })) as Prisma.InputJsonValue,
          placedAt: order.createdAt,
        },
      }),
    );

    await db.$transaction(operations);

    processed += orders.length;
    cursor = orders[orders.length - 1].id;
  }

  return processed;
}
