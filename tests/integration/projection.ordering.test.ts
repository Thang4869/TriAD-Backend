import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import {
  writeOrderHistoryProjection,
  writeProductCatalogProjection,
} from "@core/outbox/projection-writer";
import { rebuildOrderHistoryProjection } from "@core/outbox/rebuild-order-history-projection";
import { rebuildProductCatalogProjection } from "@core/outbox/rebuild-product-catalog-projection";

describe("projection ordering (integration, real DB)", () => {
  it("keeps the newer product snapshot through a concurrent stale write", async () => {
    const productId = `ordering-product-${Date.now()}`;
    const base = {
      productId,
      description: "description",
      category: "category",
      images: [],
      slug: `${productId}-slug`,
      isActive: true,
      searchText: "product description category",
      createdAt: new Date(),
    };

    const snapshot = (sourceVersion: number, name: string) =>
      ({
        ...base,
        name,
        price: sourceVersion * 10,
        stock: sourceVersion,
        sourceVersion,
      }) as Prisma.ProductCatalogProjectionUncheckedCreateInput;

    await Promise.all([
      writeProductCatalogProjection(prisma, snapshot(1, "old")),
      writeProductCatalogProjection(prisma, snapshot(2, "new")),
    ]);
    await writeProductCatalogProjection(prisma, snapshot(1, "late-old"));

    await expect(
      prisma.productCatalogProjection.findUnique({ where: { productId } }),
    ).resolves.toMatchObject({
      name: "new",
      price: 20,
      stock: 2,
      sourceVersion: 2,
    });

    await prisma.productCatalogProjection.delete({ where: { productId } });
  });

  it("keeps order status monotonic and rebuild snapshots idempotent", async () => {
    const orderId = `ordering-order-${Date.now()}`;
    const base = {
      orderId,
      userId: "ordering-user",
      orderNumber: orderId,
      paymentStatus: PaymentStatus.PENDING,
      subtotal: 100,
      tax: 0,
      shippingFee: 0,
      total: 100,
      items: [] as Prisma.InputJsonValue,
      placedAt: new Date(),
    };

    const snapshot = (sourceVersion: number, status: OrderStatus) =>
      ({
        ...base,
        status,
        sourceVersion,
      }) as Prisma.OrderHistoryProjectionUncheckedCreateInput;

    await writeOrderHistoryProjection(prisma, snapshot(0, OrderStatus.PENDING));
    await writeOrderHistoryProjection(prisma, snapshot(2, OrderStatus.SHIPPED));
    await writeOrderHistoryProjection(prisma, snapshot(0, OrderStatus.PENDING));
    await writeOrderHistoryProjection(prisma, snapshot(2, OrderStatus.SHIPPED));

    await expect(
      prisma.orderHistoryProjection.findUnique({ where: { orderId } }),
    ).resolves.toMatchObject({
      status: OrderStatus.SHIPPED,
      sourceVersion: 2,
    });

    await prisma.orderHistoryProjection.delete({ where: { orderId } });
  });

  it("repairs a legacy stale order projection and preserves a newer row", async () => {
    const orderId = `rebuild-order-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `${orderId}@test.local`,
        firstName: "Rebuild",
        lastName: "Order",
      },
    });

    try {
      await prisma.order.create({
        data: {
          id: orderId,
          userId: user.id,
          orderNumber: orderId,
          status: OrderStatus.SHIPPED,
          version: 2,
          paymentMethod: "COD",
          paymentStatus: PaymentStatus.PENDING,
          subtotal: 100,
          tax: 0,
          shippingFee: 0,
          total: 100,
          customerName: "Rebuild Order",
          customerEmail: user.email,
          customerPhone: "0123456789",
          customerAddress: "Address",
        },
      });
      await prisma.orderHistoryProjection.create({
        data: {
          orderId,
          userId: user.id,
          orderNumber: orderId,
          status: OrderStatus.PROCESSING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: 100,
          tax: 0,
          shippingFee: 0,
          total: 100,
          items: [],
          placedAt: new Date(),
          sourceVersion: -1,
        },
      });

      await rebuildOrderHistoryProjection(prisma);
      await rebuildOrderHistoryProjection(prisma);

      await expect(
        prisma.orderHistoryProjection.findUnique({ where: { orderId } }),
      ).resolves.toMatchObject({
        status: OrderStatus.SHIPPED,
        sourceVersion: 2,
      });

      await prisma.orderHistoryProjection.update({
        where: { orderId },
        data: { status: OrderStatus.DELIVERED, sourceVersion: 3 },
      });
      await rebuildOrderHistoryProjection(prisma);

      await expect(
        prisma.orderHistoryProjection.findUnique({ where: { orderId } }),
      ).resolves.toMatchObject({
        status: OrderStatus.DELIVERED,
        sourceVersion: 3,
      });
    } finally {
      await prisma.orderHistoryProjection.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("repairs legacy product fields and same-version ratings during rebuild", async () => {
    const productId = `rebuild-product-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `${productId}@test.local`,
        firstName: "Rebuild",
        lastName: "Product",
      },
    });

    try {
      await prisma.product.create({
        data: {
          id: productId,
          name: "CURRENT",
          description: "Current description",
          price: 50,
          stock: 7,
          version: 3,
          category: "current",
          images: [],
          slug: `${productId}-slug`,
        },
      });
      await prisma.review.create({
        data: { productId, userId: user.id, rating: 5 },
      });
      const secondUser = await prisma.user.create({
        data: {
          id: `rating-user-${productId}`,
          email: `rating-${productId}@test.local`,
          firstName: "Rating",
          lastName: "User",
        },
      });
      await prisma.review.create({
        data: { productId, userId: secondUser.id, rating: 4 },
      });
      await prisma.productCatalogProjection.create({
        data: {
          productId,
          name: "STALE",
          description: "stale",
          price: 1,
          stock: 1,
          category: "stale",
          images: [],
          slug: `${productId}-stale`,
          isActive: true,
          avgRating: 1,
          reviewCount: 1,
          searchText: "stale",
          sourceVersion: -1,
          createdAt: new Date(),
        },
      });

      await rebuildProductCatalogProjection(prisma);

      await expect(
        prisma.productCatalogProjection.findUnique({ where: { productId } }),
      ).resolves.toMatchObject({
        name: "CURRENT",
        stock: 7,
        sourceVersion: 3,
        avgRating: 4.5,
        reviewCount: 2,
      });
    } finally {
      await prisma.productCatalogProjection.deleteMany({
        where: { productId },
      });
      await prisma.review.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.user.deleteMany({
        where: { email: { contains: productId } },
      });
    }
  });
});
