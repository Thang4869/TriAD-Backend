import { beforeEach, describe, expect, it } from "vitest";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "@core/database/prisma";
import { PrismaOrdersRepository } from "@modules/orders/infrastructure/repositories/prisma-orders.repository";
import { Order } from "@modules/orders/domain/order.entity";

describe("PrismaOrdersRepository.updateStatusWithEvents", () => {
  const repository = new PrismaOrdersRepository();

  let orderId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();

    const user = await prisma.user.create({
      data: {
        email: `orders-${suffix}@example.com`,
        firstName: "Order",
        lastName: "Test",
        isVerified: true,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: `Product ${suffix}`,
        description: "Orders repository integration test",
        price: 100,
        stock: 10,
        category: "test",
        images: [],
        slug: `product-${suffix}`,
        isActive: true,
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${suffix}`,
        userId: user.id,
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 100,
        tax: 0,
        shippingFee: 0,
        total: 100,
        discountAmount: 0,
        customerName: "Order Test",
        customerEmail: user.email,
        customerPhone: "0123456789",
        customerAddress: "Test Address",
        items: {
          create: {
            productId: product.id,
            quantity: 1,
            price: 100,
            total: 100,
          },
        },
      },
    });

    orderId = order.id;
  });

  it("updates status and persists OrderStatusChanged in the same transaction", async () => {
    const persisted = await repository.findById(orderId);

    expect(persisted).not.toBeNull();

    const order = Order.hydrate({
      id: persisted!.id,
      userId: persisted!.userId,
      orderNumber: persisted!.orderNumber,
      status: persisted!.status,
      createdAt: persisted!.createdAt,
      customerName: persisted!.customerName,
      customerEmail: persisted!.customerEmail,
      customerPhone: persisted!.customerPhone,
      customerAddress: persisted!.customerAddress,
      paymentMethod: persisted!.paymentMethod,
      paymentStatus: persisted!.paymentStatus as PaymentStatus,
      discountAmount: persisted!.discountAmount,
      shippingFee: persisted!.shippingFee,
      tax: persisted!.tax,
      notes: persisted!.notes ?? undefined,
      discountCode: persisted!.discountCode ?? undefined,
      items: persisted!.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      version: persisted!.version,
    });

    const expectedVersion = order.version;

    order.confirm();

    const updated = await repository.updateStatusWithEvents(
      orderId,
      expectedVersion,
      order,
    );

    expect(updated.status).toBe(OrderStatus.PROCESSING);
    expect(updated.version).toBe(1);

    const storedOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(storedOrder?.status).toBe(OrderStatus.PROCESSING);
    expect(storedOrder?.version).toBe(1);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: orderId,
        eventName: "OrderStatusChanged",
      },
    });

    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]).toEqual(
      expect.objectContaining({
        aggregateId: orderId,
        eventName: "OrderStatusChanged",
        publishedAt: null,
        attempts: 0,
      }),
    );

    expect(outboxEvents[0].payload).toEqual(
      expect.objectContaining({
        eventName: "OrderStatusChanged",
        aggregateId: orderId,
        metadata: expect.objectContaining({
          oldStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.PROCESSING,
          userId: persisted!.userId,
        }),
      }),
    );

    expect(order.domainEvents).toHaveLength(0);
  });

  it("rejects a stale version and persists only one status transition", async () => {
    const persisted = await repository.findById(orderId);

    expect(persisted).not.toBeNull();

    const hydrateOrder = () =>
      Order.hydrate({
        id: persisted!.id,
        userId: persisted!.userId,
        orderNumber: persisted!.orderNumber,
        status: persisted!.status,
        createdAt: persisted!.createdAt,
        customerName: persisted!.customerName,
        customerEmail: persisted!.customerEmail,
        customerPhone: persisted!.customerPhone,
        customerAddress: persisted!.customerAddress,
        paymentMethod: persisted!.paymentMethod,
        paymentStatus: persisted!.paymentStatus as PaymentStatus,
        discountAmount: persisted!.discountAmount,
        shippingFee: persisted!.shippingFee,
        tax: persisted!.tax,
        notes: persisted!.notes ?? undefined,
        discountCode: persisted!.discountCode ?? undefined,
        items: persisted!.items.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.price,
        })),
        version: persisted!.version,
      });

    const requestA = hydrateOrder();
    const requestB = hydrateOrder();

    requestA.confirm();
    requestB.confirm();

    await repository.updateStatusWithEvents(
      orderId,
      persisted!.version,
      requestA,
    );

    await expect(
      repository.updateStatusWithEvents(orderId, persisted!.version, requestB),
    ).rejects.toThrow("Order was modified by another request. Please retry.");

    const storedOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(storedOrder?.status).toBe(OrderStatus.PROCESSING);
    expect(storedOrder?.version).toBe(1);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: orderId,
        eventName: "OrderStatusChanged",
      },
    });

    expect(outboxEvents).toHaveLength(1);
  });

  it("rolls back the status update when outbox persistence fails", async () => {
    const failingRepository = new PrismaOrdersRepository(async () => {
      throw new Error("outbox persistence failed");
    });

    const persisted = await failingRepository.findById(orderId);

    expect(persisted).not.toBeNull();

    const order = Order.hydrate({
      id: persisted!.id,
      userId: persisted!.userId,
      orderNumber: persisted!.orderNumber,
      status: persisted!.status,
      createdAt: persisted!.createdAt,
      customerName: persisted!.customerName,
      customerEmail: persisted!.customerEmail,
      customerPhone: persisted!.customerPhone,
      customerAddress: persisted!.customerAddress,
      paymentMethod: persisted!.paymentMethod,
      paymentStatus: persisted!.paymentStatus as PaymentStatus,
      discountAmount: persisted!.discountAmount,
      shippingFee: persisted!.shippingFee,
      tax: persisted!.tax,
      notes: persisted!.notes ?? undefined,
      discountCode: persisted!.discountCode ?? undefined,
      items: persisted!.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      version: persisted!.version,
    });

    const expectedVersion = order.version;

    order.confirm();

    await expect(
      failingRepository.updateStatusWithEvents(orderId, expectedVersion, order),
    ).rejects.toThrow("outbox persistence failed");

    const storedOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(storedOrder?.status).toBe(OrderStatus.PENDING);
    expect(storedOrder?.version).toBe(0);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: orderId,
        eventName: "OrderStatusChanged",
      },
    });

    expect(outboxEvents).toHaveLength(0);
  });

  it("cancellation emits two outbox events while DB version increments only once", async () => {
    const persisted = await repository.findById(orderId);

    expect(persisted).not.toBeNull();

    // Simulate an already-versioned persisted order.
    await prisma.order.update({
      where: { id: orderId },
      data: {
        version: 7,
      },
    });

    const refreshed = await repository.findById(orderId);

    expect(refreshed).not.toBeNull();
    expect(refreshed!.version).toBe(7);

    const order = Order.hydrate({
      id: refreshed!.id,
      userId: refreshed!.userId,
      orderNumber: refreshed!.orderNumber,
      status: refreshed!.status,
      createdAt: refreshed!.createdAt,
      customerName: refreshed!.customerName,
      customerEmail: refreshed!.customerEmail,
      customerPhone: refreshed!.customerPhone,
      customerAddress: refreshed!.customerAddress,
      paymentMethod: refreshed!.paymentMethod,
      paymentStatus: refreshed!.paymentStatus as PaymentStatus,
      discountAmount: refreshed!.discountAmount,
      shippingFee: refreshed!.shippingFee,
      tax: refreshed!.tax,
      notes: refreshed!.notes ?? undefined,
      discountCode: refreshed!.discountCode ?? undefined,
      items: refreshed!.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      version: refreshed!.version,
    });

    const expectedVersion = order.version;

    order.cancel();

    expect(expectedVersion).toBe(7);
    expect(order.version).toBe(7);

    expect(order.domainEvents.map((event) => event.eventName)).toEqual([
      "OrderStatusChanged",
      "OrderCancelled",
    ]);

    const updated = await repository.updateStatusWithEvents(
      orderId,
      expectedVersion,
      order,
    );

    expect(updated.status).toBe(OrderStatus.CANCELLED);
    expect(updated.version).toBe(8);

    const storedOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(storedOrder).toMatchObject({
      status: OrderStatus.CANCELLED,
      version: 8,
    });

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: orderId,
        eventName: {
          in: ["OrderStatusChanged", "OrderCancelled"],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(outboxEvents).toHaveLength(2);

    expect(outboxEvents.map((event) => event.eventName).sort()).toEqual([
      "OrderCancelled",
      "OrderStatusChanged",
    ]);

    for (const event of outboxEvents) {
      expect(event.payload).toEqual(
        expect.objectContaining({
          aggregateId: orderId,
          sourceVersion: 8,
        }),
      );
    }

    expect(order.domainEvents).toHaveLength(0);
  });
});
