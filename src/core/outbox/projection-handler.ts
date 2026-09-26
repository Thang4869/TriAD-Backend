import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import {
  ProductPriceChangedEvent,
  ProductRestockedEvent,
  ProductStockDepletedEvent,
} from "@shared/domain/events/product-events";
import { DomainEvent } from "@shared/domain/events/domain-event";
import { withSpan } from "@core/tracing/span";
import { projectionLagSeconds } from "@core/metrics/metrics.registry";

type ProductProjectionEvent =
  ProductPriceChangedEvent | ProductRestockedEvent | ProductStockDepletedEvent;

export class ProjectionHandler {
  async handleOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    await withSpan("projection.order_history.order_placed", () =>
      this.upsertOrderPlaced(event),
    );
    this.recordLag("order_history", event);
  }

  private async upsertOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    await prisma.orderHistoryProjection.upsert({
      where: { orderId: event.orderId },
      create: {
        orderId: event.orderId,
        userId: event.userId,
        orderNumber: event.orderNumber,
        status: "PENDING",
        paymentStatus: "PAID",
        subtotal: event.total,
        tax: 0,
        shippingFee: 0,
        total: event.total,
        items: event.items as unknown as Prisma.InputJsonValue,
        placedAt: new Date(),
      },
      update: {
        userId: event.userId,
        orderNumber: event.orderNumber,
        total: event.total,
        items: event.items as unknown as Prisma.InputJsonValue,
      },
    });
    await this.refreshDashboard();
  }

  async handleOrderStatusChanged(
    event: OrderStatusChangedEvent,
  ): Promise<void> {
    await withSpan("projection.order_history.status_changed", async () => {
      await prisma.orderHistoryProjection.updateMany({
        where: { orderId: event.orderId },
        data: { status: event.newStatus },
      });
      await this.refreshDashboard();
    });
    this.recordLag("order_history", event);
  }

  async handleProductEvent(event: ProductProjectionEvent): Promise<void> {
    await withSpan("projection.product_catalog.update", async () => {
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
          sourceVersion: product.version,
        },
      });
    });
    this.recordLag("product_catalog", event);
  }

  private recordLag(projection: string, event: DomainEvent): void {
    projectionLagSeconds.set(
      { projection },
      Math.max(0, (Date.now() - event.occurredAt.getTime()) / 1000),
    );
  }

  private async refreshDashboard(): Promise<void> {
    const [
      orders,
      revenue,
      pendingOrders,
      completedOrders,
      totalUsers,
      totalProducts,
    ] = await Promise.all([
      prisma.orderHistoryProjection.count(),
      prisma.orderHistoryProjection.aggregate({ _sum: { total: true } }),
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
        totalRevenue: revenue._sum.total ?? 0,
        pendingOrders,
        completedOrders,
        totalUsers,
        totalProducts,
      },
      update: {
        totalOrders: orders,
        totalRevenue: revenue._sum.total ?? 0,
        pendingOrders,
        completedOrders,
        totalUsers,
        totalProducts,
      },
    });
  }
}
