import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaDashboardRepository } from "@modules/admin/dashboard/dashboard.repository";
import { OrderStatus } from "@prisma/client";

describe("PrismaDashboardRepository (integration, real DB)", () => {
  const repository = new PrismaDashboardRepository();
  let userId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `dashboard-repo-${Date.now()}@test.com`,
        password: "hashed",
        firstName: "Dash",
        lastName: "Test",
        isVerified: true,
      },
    });
    userId = user.id;
  });

  it("getTotalRevenue() cộng đúng total các order chưa bị huỷ, bỏ qua CANCELLED", async () => {
    const _product = await prisma.product.create({
      data: {
        name: "Dashboard Product",
        description: "test",
        price: 100,
        stock: 10,
        category: "test",
        slug: `dashboard-product-${Date.now()}`,
        images: [],
      },
    });

    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        total: 500,
        customerAddress: "addr",
        customerPhone: "0123456789",
        customerName: "Test User",
        customerEmail: "test@test.com",
        paymentMethod: "COD",
        orderNumber: `ORD-${Date.now()}-1`,
        subtotal: 500,
        tax: 0,
        shippingFee: 0,
        discountAmount: 0,
        paymentStatus: "PENDING",
        idempotencyKey: "test-key-1",
      },
    });
    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.CANCELLED,
        total: 9999,
        customerAddress: "addr",
        customerPhone: "0123456789",
        customerName: "Test User",
        customerEmail: "test@test.com",
        paymentMethod: "COD",
        orderNumber: `ORD-${Date.now()}-2`,
        subtotal: 9999,
        tax: 0,
        shippingFee: 0,
        discountAmount: 0,
        paymentStatus: "PENDING",
        idempotencyKey: "test-key-2",
      },
    });

    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const total = await repository.getTotalRevenue(sinceDate);

    expect(total).toBe(500);
  });

  it("getTotalRevenue() trả về 0 khi không có order nào trong khoảng thời gian", async () => {
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const total = await repository.getTotalRevenue(sinceDate);

    expect(total).toBe(0);
  });

  it("getLowStockProducts() chỉ trả sản phẩm active có stock <= threshold, sắp xếp tăng dần", async () => {
    await prisma.product.createMany({
      data: [
        {
          name: "Low Stock A",
          description: "test",
          price: 100,
          stock: 2,
          category: "test",
          slug: `low-stock-a-${Date.now()}`,
          images: [],
          isActive: true,
        },
        {
          name: "Low Stock B",
          description: "test",
          price: 100,
          stock: 5,
          category: "test",
          slug: `low-stock-b-${Date.now()}`,
          images: [],
          isActive: true,
        },
        {
          name: "Plenty Stock",
          description: "test",
          price: 100,
          stock: 100,
          category: "test",
          slug: `plenty-stock-${Date.now()}`,
          images: [],
          isActive: true,
        },
        {
          name: "Low Stock Inactive",
          description: "test",
          price: 100,
          stock: 1,
          category: "test",
          slug: `low-stock-inactive-${Date.now()}`,
          images: [],
          isActive: false,
        },
      ],
    });

    const result = await repository.getLowStockProducts(10);

    const names = result.map((p) => p.name);
    expect(names).toContain("Low Stock A");
    expect(names).toContain("Low Stock B");
    expect(names).not.toContain("Plenty Stock");
    expect(names).not.toContain("Low Stock Inactive");
    expect(result[0].stock).toBeLessThanOrEqual(result[1]?.stock ?? Infinity);
  });

  it("getOrderStatusBreakdown() nhóm đúng số lượng order theo từng status", async () => {
    const statuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.PENDING,
      OrderStatus.DELIVERED,
    ];
    for (const [i, status] of statuses.entries()) {
      await prisma.order.create({
        data: {
          userId,
          status,
          total: 100,
          customerAddress: "addr",
          customerPhone: "0123456789",
          customerName: "Test",
          customerEmail: "test@test.com",
          paymentMethod: "COD",
          orderNumber: `ORD-status-${Date.now()}-${i}`,
          subtotal: 100,
          tax: 0,
          shippingFee: 0,
          discountAmount: 0,
          paymentStatus: "PENDING",
          idempotencyKey: `status-key-${Date.now()}-${i}`,
        },
      });
    }

    const breakdown = await repository.getOrderStatusBreakdown();

    const pendingGroup = breakdown.find(
      (g) => g.status === OrderStatus.PENDING,
    );
    const deliveredGroup = breakdown.find(
      (g) => g.status === OrderStatus.DELIVERED,
    );

    expect(pendingGroup?.count).toBeGreaterThanOrEqual(2);
    expect(deliveredGroup?.count).toBeGreaterThanOrEqual(1);
  });

  it("getTotalProductsCount() chỉ đếm sản phẩm active", async () => {
    const suffix = Date.now();
    const before = await repository.getTotalProductsCount();

    await prisma.product.createMany({
      data: [
        {
          name: "Count Active",
          description: "test",
          price: 10,
          stock: 1,
          category: "test",
          slug: `count-active-${suffix}`,
          images: [],
          isActive: true,
        },
        {
          name: "Count Inactive",
          description: "test",
          price: 10,
          stock: 1,
          category: "test",
          slug: `count-inactive-${suffix}`,
          images: [],
          isActive: false,
        },
      ],
    });

    const after = await repository.getTotalProductsCount();
    expect(after).toBe(before + 1);
  });

  it("getTotalUsersCount() và getNewUsersCount() đếm đúng, không lẫn user tạo trước window", async () => {
    const sinceDate = new Date(Date.now() - 1000);
    const oldSinceDate = new Date(Date.now() + 1000);

    const totalUsers = await repository.getTotalUsersCount();
    const newUsers = await repository.getNewUsersCount(sinceDate);
    const noNewUsers = await repository.getNewUsersCount(oldSinceDate);

    expect(totalUsers).toBeGreaterThanOrEqual(1);
    expect(newUsers).toBeGreaterThanOrEqual(1);
    expect(noNewUsers).toBe(0);
  });

  it("getRevenueByDay returns correct data", async () => {
    const _product = await prisma.product.create({
      data: {
        name: "Dash Product",
        description: "test",
        price: 100,
        stock: 10,
        category: "test",
        slug: `dash-rev-${Date.now()}`,
        images: [],
      },
    });

    for (let i = 0; i < 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.DELIVERED,
          total: 100 + i * 10,
          customerAddress: "addr",
          customerPhone: "0123456789",
          customerName: "Test",
          customerEmail: "test@test.com",
          paymentMethod: "COD",
          orderNumber: `ORD-${Date.now()}-${i}`,
          subtotal: 100 + i * 10,
          tax: 0,
          shippingFee: 0,
          discountAmount: 0,
          paymentStatus: "PENDING",
          idempotencyKey: `key-${i}`,
          createdAt: date,
        },
      });
    }

    const result = await repository.getRevenueByDay(30);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("revenue");
    expect(result[0]).toHaveProperty("orderCount");
  });

  it("getTopSellingProducts returns sorted list", async () => {
    const product1 = await prisma.product.create({
      data: {
        name: "Top1",
        description: "test",
        price: 100,
        stock: 10,
        category: "test",
        slug: `top1-${Date.now()}`,
        images: [],
      },
    });
    const product2 = await prisma.product.create({
      data: {
        name: "Top2",
        description: "test",
        price: 200,
        stock: 10,
        category: "test",
        slug: `top2-${Date.now()}`,
        images: [],
      },
    });

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        total: 300,
        customerAddress: "addr",
        customerPhone: "0123456789",
        customerName: "Test",
        customerEmail: "test@test.com",
        paymentMethod: "COD",
        orderNumber: `ORD-top-${Date.now()}`,
        subtotal: 300,
        tax: 0,
        shippingFee: 0,
        discountAmount: 0,
        paymentStatus: "PENDING",
        idempotencyKey: `key-top`,
      },
    });

    await prisma.orderItem.createMany({
      data: [
        {
          orderId: order.id,
          productId: product1.id,
          quantity: 5,
          price: 100,
          total: 500,
        },
        {
          orderId: order.id,
          productId: product2.id,
          quantity: 2,
          price: 200,
          total: 400,
        },
      ],
    });

    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await repository.getTopSellingProducts(2, sinceDate);
    expect(result[0].productId).toBe(product1.id);
    expect(result[0].totalQuantitySold).toBeGreaterThan(
      result[1].totalQuantitySold,
    );
  });
});
