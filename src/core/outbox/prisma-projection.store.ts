import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import type {
  ProjectionStore,
  ProductProjectionEvent,
} from "./projection-store.port";
import type {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import { ProjectionDependencyError } from "./projection-dependency.error";
import {
  writeOrderHistoryProjection,
  writeProductCatalogProjection,
} from "./projection-writer";
import { refreshProductRatingProjection } from "./projection-rating";

export class PrismaProjectionStore implements ProjectionStore {
  async upsertOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    await writeOrderHistoryProjection(prisma, {
      orderId: event.orderId,
      userId: event.userId,
      orderNumber: event.orderNumber,
      status: "PENDING",
      paymentStatus: event.paymentStatus,
      subtotal: event.subtotal,
      tax: event.tax,
      shippingFee: event.shippingFee,
      total: event.total,
      items: event.items as unknown as Prisma.InputJsonValue,
      placedAt: event.occurredAt,
      sourceVersion: requireSourceVersion(event.sourceVersion),
    });
  }

  async updateOrderStatus(event: OrderStatusChangedEvent): Promise<void> {
    const sourceVersion = requireSourceVersion(event.sourceVersion);
    const result = await prisma.orderHistoryProjection.updateMany({
      where: { orderId: event.orderId, sourceVersion: { lt: sourceVersion } },
      data: { status: event.newStatus, sourceVersion },
    });

    if (result.count > 0) return;

    const projection = await prisma.orderHistoryProjection.findUnique({
      where: { orderId: event.orderId },
      select: { orderId: true },
    });
    if (!projection) throw new ProjectionDependencyError(event.orderId);
  }

  async upsertProduct(event: ProductProjectionEvent): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: event.productId },
    });

    if (!product) return;

    await writeProductCatalogProjection(prisma, {
      productId: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.stock,
      category: product.category,
      images: product.images,
      slug: product.slug,
      isActive: product.isActive,
      searchText: `${product.name} ${product.description ?? ""} ${product.category}`,
      sourceVersion: product.version,
      createdAt: product.createdAt,
    });
  }

  async refreshProductRating(productId: string): Promise<void> {
    await prisma.$transaction((tx) =>
      refreshProductRatingProjection(tx, productId),
    );
  }

  async refreshDashboard(): Promise<void> {
    const [
      orders,
      grossOrderValue,
      pendingOrders,
      completedOrders,
      totalUsers,
      totalProducts,
    ] = await Promise.all([
      prisma.orderHistoryProjection.count(),
      prisma.orderHistoryProjection.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { total: true },
      }),
      prisma.orderHistoryProjection.count({ where: { status: "PENDING" } }),
      prisma.orderHistoryProjection.count({
        where: { status: { in: ["DELIVERED", "REFUNDED"] } },
      }),
      prisma.user.count(),
      prisma.productCatalogProjection.count({ where: { isActive: true } }),
    ]);

    await prisma.adminDashboardProjection.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        totalOrders: orders,
        totalGrossOrderValue: grossOrderValue._sum.total ?? 0,
        pendingOrders,
        completedOrders,
        totalUsers,
        totalProducts,
      },
      update: {
        totalOrders: orders,
        totalGrossOrderValue: grossOrderValue._sum.total ?? 0,
        pendingOrders,
        completedOrders,
        totalUsers,
        totalProducts,
      },
    });
  }
}

function requireSourceVersion(sourceVersion: number | undefined): number {
  if (sourceVersion === undefined) {
    throw new Error("Versioned projection event is required");
  }
  return sourceVersion;
}
