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
});
