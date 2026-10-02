import { beforeEach, describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaDashboardReadRepository } from "@modules/admin/dashboard/infrastructure/repositories/prisma-dashboard-read.repository";
import { PrismaOrderHistoryReadRepository } from "@modules/orders/infrastructure/repositories/prisma-order-history-read.repository";
import { PrismaProductCatalogReadRepository } from "@modules/products/infrastructure/repositories/prisma-product-catalog-read.repository";
import { OrderStatus } from "@prisma/client";

describe("projection read adapters (integration, real DB)", () => {
  const dashboard = new PrismaDashboardReadRepository();
  const orderHistory = new PrismaOrderHistoryReadRepository();
  const catalog = new PrismaProductCatalogReadRepository();
  let userId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `projection-read-${Date.now()}@test.local`,
        password: "hashed",
        firstName: "Projection",
        lastName: "Read",
        isVerified: true,
      },
    });
    userId = user.id;
  });

  it("returns empty order analytics as zero/empty when the read model has no matching rows", async () => {
    const sinceDate = new Date("2099-01-01T00:00:00.000Z");

    await expect(dashboard.getGrossOrderValue(sinceDate)).resolves.toBe(0);
    await expect(dashboard.getGrossOrderValueByDay(sinceDate)).resolves.toEqual(
      [],
    );
    await expect(
      dashboard.getTopSellingProducts(5, sinceDate),
    ).resolves.toEqual([]);
  });

  it("reads catalog, order history and dashboard values from projections when write models diverge", async () => {
    const placedAt = new Date("2020-01-02T10:00:00.000Z");
    const sinceDate = new Date("2020-01-01T00:00:00.000Z");
    const productId = `projection-product-${Date.now()}`;
    const orderId = `projection-order-${Date.now()}`;

    await prisma.product.create({
      data: {
        id: productId,
        name: "Write model product",
        description: "write model",
        price: 999,
        stock: 99,
        category: "write",
        slug: `${productId}-write`,
        images: [],
      },
    });
    await prisma.productCatalogProjection.create({
      data: {
        productId,
        name: "Projection product",
        description: "projection",
        price: 10,
        stock: 2,
        category: "projection",
        images: [],
        slug: `${productId}-projection`,
        isActive: true,
        searchText: "Projection product projection",
        createdAt: placedAt,
      },
    });

    await prisma.order.create({
      data: {
        id: orderId,
        userId,
        status: OrderStatus.DELIVERED,
        total: 9999,
        customerAddress: "write address",
        customerPhone: "0123456789",
        customerName: "Write order",
        customerEmail: "write@test.local",
        paymentMethod: "COD",
        orderNumber: `WRITE-${orderId}`,
        subtotal: 9999,
        tax: 0,
        shippingFee: 0,
        discountAmount: 0,
        paymentStatus: "PENDING",
        idempotencyKey: `write-${orderId}`,
        createdAt: placedAt,
      },
    });
    await prisma.orderHistoryProjection.create({
      data: {
        orderId,
        userId,
        orderNumber: `PROJECTION-${orderId}`,
        status: OrderStatus.PENDING,
        paymentStatus: "PENDING",
        subtotal: 100,
        tax: 0,
        shippingFee: 0,
        total: 100,
        items: [
          {
            productId,
            productName: "Projection product",
            quantity: 2,
            unitPrice: 50,
          },
        ],
        placedAt,
        sourceVersion: 0,
      },
    });
    await prisma.orderHistoryProjection.create({
      data: {
        orderId: `${orderId}-cancelled`,
        userId,
        orderNumber: `CANCELLED-${orderId}`,
        status: OrderStatus.CANCELLED,
        paymentStatus: "PENDING",
        subtotal: 900,
        tax: 0,
        shippingFee: 0,
        total: 900,
        items: [
          {
            productId,
            productName: "Projection product",
            quantity: 9,
            unitPrice: 100,
          },
        ],
        placedAt,
        sourceVersion: 0,
      },
    });
    await prisma.adminDashboardProjection.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        totalGrossOrderValue: 700,
        totalOrders: 70,
        pendingOrders: 7,
        completedOrders: 6,
        totalUsers: 42,
        totalProducts: 8,
      },
      update: {
        totalGrossOrderValue: 700,
        totalOrders: 70,
        pendingOrders: 7,
        completedOrders: 6,
        totalUsers: 42,
        totalProducts: 8,
      },
    });

    const catalogResult = await catalog.findMany({
      where: { isActive: true, category: "projection" },
    });
    const orderResult = await orderHistory.findByIdAndUser(orderId, userId);
    const grossOrderValue = await dashboard.getGrossOrderValue(sinceDate);
    const daily = await dashboard.getGrossOrderValueByDay(sinceDate);
    const statusBreakdown = await dashboard.getOrderStatusBreakdown();
    const topSelling = await dashboard.getTopSellingProducts(5, sinceDate);
    const lowStock = await dashboard.getLowStockProducts(10);

    expect(catalogResult[0]).toMatchObject({
      id: productId,
      name: "Projection product",
      price: 10,
      stock: 2,
    });
    expect(orderResult).toMatchObject({
      orderId,
      orderNumber: `PROJECTION-${orderId}`,
      status: OrderStatus.PENDING,
      total: 100,
    });
    expect(grossOrderValue).toBe(100);
    expect(daily).toEqual([
      { date: "2020-01-02", grossOrderValue: 100, orderCount: 1 },
    ]);
    expect(statusBreakdown).toEqual([
      { status: OrderStatus.CANCELLED, count: 1 },
      { status: OrderStatus.PENDING, count: 1 },
    ]);
    expect(topSelling[0]).toMatchObject({
      productId,
      name: "Projection product",
      totalQuantitySold: 2,
      totalOrderValue: 100,
    });
    expect(lowStock).toContainEqual({
      id: productId,
      name: "Projection product",
      stock: 2,
      slug: `${productId}-projection`,
    });
    await expect(dashboard.getTotalUsersCount()).resolves.toBe(42);
    await expect(dashboard.getTotalProductsCount()).resolves.toBe(8);
  });
});
