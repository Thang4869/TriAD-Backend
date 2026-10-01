import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { Order as OrderAggregate } from "@modules/orders/domain/order.entity";
import { Money } from "@shared/value-objects/money";
import { IdempotencyConflictError } from "@modules/checkout/application/errors/idempotency-conflict.error";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";

describe("PrismaCheckoutRepository (integration)", () => {
  const repository = new PrismaCheckoutRepository();
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `checkout-repo-${Date.now()}@test.com`,
        password: "h",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        name: "Checkout Product",
        description: "d",
        price: 100,
        stock: 10,
        category: "c",
        slug: `checkout-p-${Date.now()}`,
        images: [],
      },
    });
    productId = product.id;
  });

  it("lockProductsForUpdate trả đúng version/stock hiện tại trong transaction", async () => {
    await repository.runInTransaction(async (tx) => {
      const rows = await repository.lockProductsForUpdate(tx, [productId]);

      expect(rows).toHaveLength(1);
      expect(rows[0].stock).toBe(10);
      expect(rows[0].version).toBe(0);
    });
  });

  it("decrementProductStock thành công khi version khớp (optimistic lock hợp lệ)", async () => {
    await repository.runInTransaction(async (tx) => {
      const success = await repository.decrementProductStock(
        tx,
        productId,
        0,
        3,
      );
      expect(success).toBe(true);
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(product?.stock).toBe(7);
    expect(product?.version).toBe(1);
  });

  it("decrementProductStock trả false khi version KHÔNG khớp (phát hiện concurrent write)", async () => {
    await repository.runInTransaction(async (tx) => {
      const success = await repository.decrementProductStock(
        tx,
        productId,
        99,
        3,
      );
      expect(success).toBe(false);
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(product?.stock).toBe(10);
  });

  it("stock reservation ghi ProductUpdated outbox cùng transaction với decrement", async () => {
    const stockService = new StockReservationService(repository);

    await repository.runInTransaction(async (tx) => {
      await stockService.reserveStock(tx, [{ productId, quantity: 3 }]);
    });

    await expect(
      prisma.product.findUnique({ where: { id: productId } }),
    ).resolves.toMatchObject({ stock: 7, version: 1 });
    await expect(
      prisma.outboxEvent.findFirst({
        where: { aggregateId: productId, eventName: "ProductUpdated" },
      }),
    ).resolves.toMatchObject({ aggregateId: productId });
  });

  it("stock event failure rollback stock and order transaction", async () => {
    const failingRepository = new PrismaCheckoutRepository(async () => {
      throw new Error("product event persistence failed");
    });
    const stockService = new StockReservationService(failingRepository);
    const orderNumber = `ORD-stock-rollback-${Date.now()}`;

    await expect(
      failingRepository.runInTransaction(async (tx) => {
        await failingRepository.createOrder(tx, {
          orderNumber,
          userId,
          status: "PENDING",
          paymentMethod: "COD",
          paymentStatus: "PENDING",
          subtotal: 100,
          tax: 0,
          shippingFee: 0,
          total: 100,
          discountAmount: 0,
          customerName: "A",
          customerEmail: "a@test.com",
          customerPhone: "012",
          customerAddress: "addr",
        });
        await stockService.reserveStock(tx, [{ productId, quantity: 3 }]);
      }),
    ).rejects.toThrow("product event persistence failed");

    await expect(
      prisma.product.findUnique({ where: { id: productId } }),
    ).resolves.toMatchObject({ stock: 10, version: 0 });
    await expect(
      prisma.order.findUnique({ where: { orderNumber } }),
    ).resolves.toBeNull();
    await expect(
      prisma.outboxEvent.findFirst({
        where: { aggregateId: productId, eventName: "ProductUpdated" },
      }),
    ).resolves.toBeNull();
  });

  it("findUserCartForCheckout trả về user kèm cart + items + product", async () => {
    const cart = await prisma.cart.create({ data: { userId } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, quantity: 3 },
    });

    const result = await repository.findUserCartForCheckout(userId);

    expect(result?.cart?.items).toHaveLength(1);
    expect(result?.cart?.items[0].product.id).toBe(productId);
    expect(result?.cart?.items[0].quantity).toBe(3);
  });

  it("findUserCartForCheckout trả null khi user không tồn tại", async () => {
    await expect(
      repository.findUserCartForCheckout(
        "00000000-0000-0000-0000-000000000000",
      ),
    ).resolves.toBeNull();
  });

  it("findOrderWithItems trả order kèm items và product, null khi không tìm thấy", async () => {
    const order = await repository.runInTransaction((tx) =>
      repository.createOrder(tx, {
        orderNumber: `ORD-find-${Date.now()}`,
        userId,
        status: "PENDING",
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        subtotal: 100,
        tax: 0,
        shippingFee: 0,
        total: 100,
        discountAmount: 0,
        customerName: "A",
        customerEmail: "a@test.com",
        customerPhone: "012",
        customerAddress: "addr",
        idempotencyKey: `idem-find-${Date.now()}`,
      }),
    );
    await repository.runInTransaction((tx) =>
      repository.createOrderItems(tx, [
        { orderId: order.id, productId, quantity: 1, price: 100, total: 100 },
      ]),
    );

    const found = await repository.findOrderWithItems(order.id);
    const notFound = await repository.findOrderWithItems(
      "00000000-0000-0000-0000-000000000000",
    );

    expect(found?.items).toHaveLength(1);
    expect(notFound).toBeNull();
  });

  describe("findDiscountByCode / incrementDiscountUsage", () => {
    it("findDiscountByCode trả về đúng bản ghi discount theo code, null khi không tồn tại", async () => {
      const suffix = Date.now();
      const discount = await (prisma as any).discount.create({
        data: {
          code: `SAVE10-${suffix}`,
          isActive: true,
          expiresAt: null,
          minOrderAmount: null,
          maxUses: null,
          usedCount: 0,
          type: "PERCENTAGE",
          value: 10,
        },
      });

      await repository.runInTransaction(async (tx) => {
        const found = await repository.findDiscountByCode(tx, discount.code);
        expect(found).toMatchObject({
          code: discount.code,
          type: "PERCENTAGE",
          value: 10,
        });

        const notFound = await repository.findDiscountByCode(
          tx,
          `NON-EXISTENT-${suffix}`,
        );
        expect(notFound).toBeNull();
      });
    });

    it("incrementDiscountUsage tăng usedCount và trả true khi còn lượt dùng", async () => {
      const suffix = Date.now();
      const discount = await (prisma as any).discount.create({
        data: {
          code: `LIMITED-${suffix}`,
          isActive: true,
          expiresAt: null,
          minOrderAmount: null,
          maxUses: 5,
          usedCount: 0,
          type: "FIXED",
          value: 50,
        },
      });

      const success = await repository.runInTransaction((tx) =>
        repository.incrementDiscountUsage(tx, discount.id, discount.maxUses),
      );

      expect(success).toBe(true);

      const updated = await (prisma as any).discount.findUnique({
        where: { id: discount.id },
      });
      expect(updated.usedCount).toBe(1);
    });

    it("incrementDiscountUsage trả false khi đã đạt giới hạn maxUses (không tăng thêm)", async () => {
      const suffix = Date.now();
      const discount = await (prisma as any).discount.create({
        data: {
          code: `MAXED-${suffix}`,
          isActive: true,
          expiresAt: null,
          minOrderAmount: null,
          maxUses: 2,
          usedCount: 2,
          type: "FIXED",
          value: 50,
        },
      });

      const success = await repository.runInTransaction((tx) =>
        repository.incrementDiscountUsage(tx, discount.id, discount.maxUses),
      );

      expect(success).toBe(false);

      const updated = await (prisma as any).discount.findUnique({
        where: { id: discount.id },
      });
      expect(updated.usedCount).toBe(2);
    });

    it("incrementDiscountUsage bỏ qua kiểm tra maxUses khi maxUses là null (không giới hạn)", async () => {
      const suffix = Date.now();
      const discount = await (prisma as any).discount.create({
        data: {
          code: `UNLIMITED-${suffix}`,
          isActive: true,
          expiresAt: null,
          minOrderAmount: null,
          maxUses: null,
          usedCount: 1000,
          type: "PERCENTAGE",
          value: 5,
        },
      });

      const success = await repository.runInTransaction((tx) =>
        repository.incrementDiscountUsage(tx, discount.id, null),
      );

      expect(success).toBe(true);
    });
  });

  it("createOrder + createOrderItems + clearCartItems hoạt động đúng trong 1 transaction", async () => {
    const cart = await prisma.cart.create({ data: { userId } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, quantity: 2 },
    });

    const order = await repository.runInTransaction(async (tx) => {
      const createdOrder = await repository.createOrder(tx, {
        orderNumber: `ORD-${Date.now()}`,
        userId,
        status: "PENDING",
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        subtotal: 200,
        tax: 0,
        shippingFee: 0,
        total: 200,
        discountAmount: 0,
        customerName: "A B",
        customerEmail: "a@test.com",
        customerPhone: "0123456789",
        customerAddress: "addr",
        idempotencyKey: `idem-${Date.now()}`,
      });

      await repository.createOrderItems(tx, [
        {
          orderId: createdOrder.id,
          productId,
          quantity: 2,
          price: 100,
          total: 200,
        },
      ]);
      await repository.clearCartItems(tx, cart.id);

      return createdOrder;
    });

    const orderWithItems = await repository.findOrderWithItems(order.id);
    const remainingCartItems = await prisma.cartItem.count({
      where: { cartId: cart.id },
    });

    expect(orderWithItems?.items).toHaveLength(1);
    expect(remainingCartItems).toBe(0);
  });

  it("saveNewOrder tạo order + orderItems + ghi domain event trong 1 lần gọi", async () => {
    const order = OrderAggregate.create({
      id: `order-${Date.now()}`,
      userId,
      orderNumber: `ORD-SAVE-${Date.now()}`,
      customerName: "Nguyễn Văn A",
      customerEmail: "a@test.com",
      customerPhone: "0123456789",
      customerAddress: "123 Đường ABC",
      paymentMethod: "COD",
    });
    order.addItem(productId, "Checkout Product", 2, new Money(100));
    order.place();

    const idempotencyKey = `idem-save-${Date.now()}`;
    const created = await repository.runInTransaction(async (tx) => {
      return repository.saveNewOrder(tx, order, idempotencyKey);
    });

    expect(created.id).toBe(order.id);
    expect(created.orderNumber).toBe(order.orderNumber);
    expect(created.idempotencyKey).toBe(idempotencyKey);
    expect(created.customerName).toBe("Nguyễn Văn A");
    expect(created.subtotal).toBe(200);
    expect(created.total).toBe(200);

    const orderWithItems = await repository.findOrderWithItems(created.id);
    expect(orderWithItems?.items).toHaveLength(1);
    expect(orderWithItems?.items[0].productId).toBe(productId);
    expect(orderWithItems?.items[0].quantity).toBe(2);
    expect(orderWithItems?.items[0].price).toBe(100);
    expect(orderWithItems?.items[0].total).toBe(200);
  });

  it("translates duplicate idempotencyKey into IdempotencyConflictError", async () => {
    const idempotencyKey = `idem-duplicate-${Date.now()}`;

    const firstOrder = OrderAggregate.create({
      id: `order-first-${Date.now()}`,
      userId,
      orderNumber: `ORD-FIRST-${Date.now()}`,
      customerName: "A",
      customerEmail: "a@test.com",
      customerPhone: "0123456789",
      customerAddress: "Address",
      paymentMethod: "COD",
    });
    firstOrder.addItem(productId, "Checkout Product", 1, new Money(100));
    firstOrder.place();

    await repository.runInTransaction((tx) =>
      repository.saveNewOrder(tx, firstOrder, idempotencyKey),
    );

    const secondOrder = OrderAggregate.create({
      id: `order-second-${Date.now()}`,
      userId,
      orderNumber: `ORD-SECOND-${Date.now()}`,
      customerName: "A",
      customerEmail: "a@test.com",
      customerPhone: "0123456789",
      customerAddress: "Address",
      paymentMethod: "COD",
    });
    secondOrder.addItem(productId, "Checkout Product", 1, new Money(100));
    secondOrder.place();

    await expect(
      repository.runInTransaction((tx) =>
        repository.saveNewOrder(tx, secondOrder, idempotencyKey),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("allows different users to use the same idempotencyKey", async () => {
    const sharedIdempotencyKey = `idem-shared-${Date.now()}`;

    const secondUser = await prisma.user.create({
      data: {
        email: `checkout-repo-second-${Date.now()}@test.com`,
        password: "h",
        firstName: "Second",
        lastName: "User",
        isVerified: true,
      },
    });

    const firstOrder = OrderAggregate.create({
      id: `order-user-a-${Date.now()}`,
      userId,
      orderNumber: `ORD-USER-A-${Date.now()}`,
      customerName: "User A",
      customerEmail: "a@test.com",
      customerPhone: "0123456789",
      customerAddress: "Address A",
      paymentMethod: "COD",
    });

    firstOrder.addItem(productId, "Checkout Product", 1, new Money(100));
    firstOrder.place();

    await repository.runInTransaction((tx) =>
      repository.saveNewOrder(tx, firstOrder, sharedIdempotencyKey),
    );

    const secondOrder = OrderAggregate.create({
      id: `order-user-b-${Date.now()}`,
      userId: secondUser.id,
      orderNumber: `ORD-USER-B-${Date.now()}`,
      customerName: "User B",
      customerEmail: "b@test.com",
      customerPhone: "0123456789",
      customerAddress: "Address B",
      paymentMethod: "COD",
    });

    secondOrder.addItem(productId, "Checkout Product", 1, new Money(100));
    secondOrder.place();

    await expect(
      repository.runInTransaction((tx) =>
        repository.saveNewOrder(tx, secondOrder, sharedIdempotencyKey),
      ),
    ).resolves.toBeDefined();

    const orders = await prisma.order.findMany({
      where: {
        idempotencyKey: sharedIdempotencyKey,
      },
    });

    expect(orders).toHaveLength(2);
    expect(orders.map((order) => order.userId)).toEqual(
      expect.arrayContaining([userId, secondUser.id]),
    );
  });

  it("does not translate duplicate orderNumber into IdempotencyConflictError", async () => {
    const orderNumber = `ORD-DUPLICATE-${Date.now()}`;

    const firstOrder = OrderAggregate.create({
      id: `order-number-first-${Date.now()}`,
      userId,
      orderNumber,
      customerName: "A",
      customerEmail: "a@test.com",
      customerPhone: "0123456789",
      customerAddress: "Address",
      paymentMethod: "COD",
    });
    firstOrder.addItem(productId, "Checkout Product", 1, new Money(100));
    firstOrder.place();

    await repository.runInTransaction((tx) =>
      repository.saveNewOrder(
        tx,
        firstOrder,
        `idem-order-number-first-${Date.now()}`,
      ),
    );

    const secondOrder = OrderAggregate.create({
      id: `order-number-second-${Date.now()}`,
      userId,
      orderNumber,
      customerName: "A",
      customerEmail: "a@test.com",
      customerPhone: "0123456789",
      customerAddress: "Address",
      paymentMethod: "COD",
    });
    secondOrder.addItem(productId, "Checkout Product", 1, new Money(100));
    secondOrder.place();

    const operation = repository.runInTransaction((tx) =>
      repository.saveNewOrder(
        tx,
        secondOrder,
        `idem-order-number-second-${Date.now()}`,
      ),
    );

    try {
      await operation;
      throw new Error("Expected duplicate orderNumber to fail");
    } catch (error) {
      expect(error).not.toBeInstanceOf(IdempotencyConflictError);
      expect(error).toMatchObject({
        code: "P2002",
      });
    }
  });

  it("saveNewOrder cho phép notes/discountCode undefined và discountAmount = 0", async () => {
    const order = OrderAggregate.create({
      id: `order-nodiscount-${Date.now()}`,
      userId,
      orderNumber: `ORD-ND-${Date.now()}`,
      customerName: "B",
      customerEmail: "b@test.com",
      customerPhone: "0987654321",
      customerAddress: "456 Đường XYZ",
      paymentMethod: "COD",
    });
    order.addItem(productId, "Checkout Product", 1, new Money(100));
    order.place();

    const created = await repository.runInTransaction(async (tx) =>
      repository.saveNewOrder(tx, order, `idem-nd-${Date.now()}`),
    );

    expect(created.discountAmount).toBe(0);
    expect(created.discountCode).toBeNull();
    expect(created.notes).toBeNull();
  });

  it("findOrdersByUser/countOrdersByUser/findOrderByUserAndId chỉ trả order của đúng user", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `checkout-other-${Date.now()}@test.com`,
        password: "h",
        firstName: "C",
        lastName: "D",
        isVerified: true,
      },
    });

    const order = await repository.runInTransaction((tx) =>
      repository.createOrder(tx, {
        orderNumber: `ORD-${Date.now()}`,
        userId,
        status: "PENDING",
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        subtotal: 100,
        tax: 0,
        shippingFee: 0,
        total: 100,
        discountAmount: 0,
        customerName: "A",
        customerEmail: "a@test.com",
        customerPhone: "012",
        customerAddress: "addr",
        idempotencyKey: `idem-list-${Date.now()}`,
      }),
    );

    const myOrders = await repository.findOrdersByUser(userId, 0, 10);
    const otherOrders = await repository.findOrdersByUser(otherUser.id, 0, 10);
    const found = await repository.findOrderByUserAndId(order.id, userId);
    const notFound = await repository.findOrderByUserAndId(
      order.id,
      otherUser.id,
    );

    expect(myOrders.map((o) => o.id)).toContain(order.id);
    expect(otherOrders).toHaveLength(0);
    expect(found).not.toBeNull();
    expect(notFound).toBeNull();
    expect(await repository.countOrdersByUser(userId)).toBeGreaterThanOrEqual(
      1,
    );
  });
});
