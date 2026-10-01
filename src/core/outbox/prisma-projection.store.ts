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

export class PrismaProjectionStore implements ProjectionStore {
  async upsertOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    await prisma.orderHistoryProjection.upsert({
      where: { orderId: event.orderId },
      create: {
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
      },
      update: {
        userId: event.userId,
        orderNumber: event.orderNumber,
        paymentStatus: event.paymentStatus,
        subtotal: event.subtotal,
        tax: event.tax,
        shippingFee: event.shippingFee,
        total: event.total,
        items: event.items as unknown as Prisma.InputJsonValue,
        placedAt: event.occurredAt,
      },
    });
  }

  async updateOrderStatus(event: OrderStatusChangedEvent): Promise<void> {
    await prisma.orderHistoryProjection.updateMany({
      where: { orderId: event.orderId },
      data: { status: event.newStatus },
    });
  }

  async upsertProduct(event: ProductProjectionEvent): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: event.productId },
    });

    if (!product) return;

    await prisma.productCatalogProjection.upsert({
      where: { productId: product.id },
      create: {
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
      },
      update: {
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        category: product.category,
        images: product.images,
        slug: product.slug,
        isActive: product.isActive,
        searchText: `${product.name} ${product.description ?? ""} ${product.category}`,
        createdAt: product.createdAt,
        sourceVersion: product.version,
      },
    });
  }

  async refreshProductRating(productId: string): Promise<void> {
    const rating = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.productCatalogProjection.updateMany({
      where: { productId },
      data: {
        avgRating: rating._avg.rating ?? 0,
        reviewCount: rating._count.rating,
      },
    });
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
