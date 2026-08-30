import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@core/database/prisma';
import { PrismaCheckoutRepository } from '@modules/checkout/checkout.repository';

vi.mock('@core/redis/client', () => ({
  default: { get: vi.fn(), setex: vi.fn() },
}));
import redis from '@core/redis/client';
import { vi } from 'vitest';

describe('PrismaCheckoutRepository (integration)', () => {
  const repository = new PrismaCheckoutRepository();
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await prisma.user.create({
      data: {
        email: `checkout-repo-${Date.now()}@test.com`,
        password: 'h',
        firstName: 'A',
        lastName: 'B',
        isVerified: true,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        name: 'Checkout Product',
        description: 'd',
        price: 100,
        stock: 10,
        category: 'c',
        slug: `checkout-p-${Date.now()}`,
        images: [],
      },
    });
    productId = product.id;
  });

  it('cacheOrderId/findCachedOrderId round-trip qua Redis mock đúng key prefix', async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify('order-123'));

    await repository.cacheOrderId('idem-key-1', 'order-123', 86400);
    const cached = await repository.findCachedOrderId('idem-key-1');

    expect(redis.setex).toHaveBeenCalledWith(
      'idempotent:idem-key-1',
      86400,
      JSON.stringify('order-123'),
    );
    expect(cached).toBe('order-123');
  });

  it('findCachedOrderId trả null khi Redis không có key', async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    await expect(repository.findCachedOrderId('no-key')).resolves.toBeNull();
  });

  it('lockProductsForUpdate trả đúng version/stock hiện tại trong transaction', async () => {
    await repository.runInTransaction(async (tx) => {
      const rows = await repository.lockProductsForUpdate(tx, [productId]);

      expect(rows).toHaveLength(1);
      expect(rows[0].stock).toBe(10);
      expect(rows[0].version).toBe(0);
    });
  });

  it('decrementProductStock thành công khi version khớp (optimistic lock hợp lệ)', async () => {
    await repository.runInTransaction(async (tx) => {
      const success = await repository.decrementProductStock(tx, productId, 0, 3);
      expect(success).toBe(true);
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(product?.stock).toBe(7);
    expect(product?.version).toBe(1);
  });

  it('decrementProductStock trả false khi version KHÔNG khớp (phát hiện concurrent write)', async () => {
    await repository.runInTransaction(async (tx) => {
      const success = await repository.decrementProductStock(tx, productId, 99, 3);
      expect(success).toBe(false);
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(product?.stock).toBe(10);
  });

  it('createOrder + createOrderItems + clearCartItems hoạt động đúng trong 1 transaction', async () => {
    const cart = await prisma.cart.create({ data: { userId } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, quantity: 2 },
    });

    const order = await repository.runInTransaction(async (tx) => {
      const createdOrder = await repository.createOrder(tx, {
        orderNumber: `ORD-${Date.now()}`,
        userId,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: 200,
        tax: 0,
        shippingFee: 0,
        total: 200,
        discountAmount: 0,
        customerName: 'A B',
        customerEmail: 'a@test.com',
        customerPhone: '0123456789',
        customerAddress: 'addr',
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

  it('findOrdersByUser/countOrdersByUser/findOrderByUserAndId chỉ trả order của đúng user', async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `checkout-other-${Date.now()}@test.com`,
        password: 'h',
        firstName: 'C',
        lastName: 'D',
        isVerified: true,
      },
    });

    const order = await repository.runInTransaction((tx) =>
      repository.createOrder(tx, {
        orderNumber: `ORD-${Date.now()}`,
        userId,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: 100,
        tax: 0,
        shippingFee: 0,
        total: 100,
        discountAmount: 0,
        customerName: 'A',
        customerEmail: 'a@test.com',
        customerPhone: '012',
        customerAddress: 'addr',
        idempotencyKey: `idem-list-${Date.now()}`,
      }),
    );

    const myOrders = await repository.findOrdersByUser(userId, 0, 10);
    const otherOrders = await repository.findOrdersByUser(otherUser.id, 0, 10);
    const found = await repository.findOrderByUserAndId(order.id, userId);
    const notFound = await repository.findOrderByUserAndId(order.id, otherUser.id);

    expect(myOrders.map((o) => o.id)).toContain(order.id);
    expect(otherOrders).toHaveLength(0);
    expect(found).not.toBeNull();
    expect(notFound).toBeNull();
    expect(await repository.countOrdersByUser(userId)).toBeGreaterThanOrEqual(1);
  });
});
