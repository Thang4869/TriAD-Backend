import { describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { PrismaProductsRepository } from "@modules/products/infrastructure/repositories/prisma-products.repository";
import { PrismaProductCatalogReadRepository } from "@modules/products/infrastructure/repositories/prisma-product-catalog-read.repository";
import { PrismaOrderHistoryReadRepository } from "@modules/orders/infrastructure/repositories/prisma-order-history-read.repository";

const repository = new PrismaCheckoutRepository();
const products = new PrismaProductsRepository();
const catalog = new PrismaProductCatalogReadRepository();
const orderHistory = new PrismaOrderHistoryReadRepository();

const exactPrice = 123_456_789;

describe("exact monetary persistence (integration, real DB)", () => {
  it("uses exact numeric columns for persisted monetary fields", async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        numeric_scale: number | null;
      }>
    >`
      SELECT table_name, column_name, data_type, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'products' AND column_name = 'price')
          OR (table_name = 'orders' AND column_name IN ('subtotal', 'tax', 'shippingFee', 'discountAmount', 'total'))
          OR (table_name = 'order_items' AND column_name IN ('price', 'total'))
          OR (table_name = 'product_catalog_projection' AND column_name = 'price')
          OR (table_name = 'order_history_projection' AND column_name IN ('subtotal', 'tax', 'shippingFee', 'total'))
          OR (table_name = 'admin_dashboard_projection' AND column_name = 'totalGrossOrderValue')
        )
    `;

    expect(columns).toHaveLength(14);
    expect(columns.every((column) => column.data_type === "numeric")).toBe(
      true,
    );
    expect(
      columns
        .filter((column) => column.table_name !== "discounts")
        .every((column) => column.numeric_scale === 0),
    ).toBe(true);
  });

  it("round-trips product, order item, order, and projection money exactly", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const user = await prisma.user.create({
      data: {
        email: `money-${suffix}@test.local`,
        firstName: "Money",
        lastName: "Test",
      },
    });
    const product = await products.create({
      name: "Exact Money Product",
      description: "Exact money persistence",
      price: exactPrice,
      stock: 10,
      category: `money-${suffix}`,
      images: [],
      slug: `money-${suffix}`,
    });

    expect(product.price).toBe(exactPrice);
    await prisma.productCatalogProjection.create({
      data: {
        productId: product.id,
        name: product.name,
        description: product.description,
        price: exactPrice,
        stock: product.stock,
        category: product.category,
        images: product.images,
        slug: `${product.slug}-projection`,
        isActive: true,
        searchText: product.name,
        sourceVersion: 0,
      },
    });

    const order = await repository.runInTransaction((tx) =>
      repository.createOrder(tx, {
        orderNumber: `ORD-MONEY-${suffix}`,
        userId: user.id,
        status: "PENDING",
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        subtotal: exactPrice,
        tax: 12_345,
        shippingFee: 30_000,
        total: exactPrice + 12_345 + 30_000,
        discountAmount: 0,
        customerName: "Money Test",
        customerEmail: user.email,
        customerPhone: "0123456789",
        customerAddress: "Exact address",
      }),
    );
    await repository.runInTransaction((tx) =>
      repository.createOrderItems(tx, [
        {
          orderId: order.id,
          productId: product.id,
          quantity: 1,
          price: exactPrice,
          total: exactPrice,
        },
      ]),
    );

    const checkoutOrder = await repository.findOrderWithItems(order.id);
    expect(checkoutOrder).toMatchObject({
      subtotal: exactPrice,
      tax: 12_345,
      shippingFee: 30_000,
      total: exactPrice + 12_345 + 30_000,
      items: [{ price: exactPrice, total: exactPrice }],
    });

    const catalogProduct = await catalog.findMany({
      where: { category: `money-${suffix}` },
      orderBy: { productId: "asc" },
      skip: 0,
      take: 1,
    });
    expect(catalogProduct[0]?.price).toBe(exactPrice);

    await prisma.orderHistoryProjection.create({
      data: {
        orderId: `history-${suffix}`,
        userId: user.id,
        orderNumber: `HISTORY-${suffix}`,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal: exactPrice,
        tax: 12_345,
        shippingFee: 30_000,
        total: exactPrice + 12_345 + 30_000,
        items: [],
        placedAt: new Date(),
        sourceVersion: 0,
      },
    });
    const history = await orderHistory.findByIdAndUser(
      `history-${suffix}`,
      user.id,
    );
    expect(history).toMatchObject({
      subtotal: exactPrice,
      tax: 12_345,
      shippingFee: 30_000,
      total: exactPrice + 12_345 + 30_000,
    });
  });
});
