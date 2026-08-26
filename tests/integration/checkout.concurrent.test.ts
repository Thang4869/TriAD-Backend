import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import prisma from '../../src/core/database/prisma';
import { CheckoutService } from '../../src/modules/checkout/checkout.service';

vi.mock('@core/redis/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('@core/queue/bull', () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
}));

describe('Checkout Concurrency', () => {
  const mockEmailService = {
    sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
  };
  const checkoutService = new CheckoutService(mockEmailService as any);

  beforeAll(async () => {
    // 1. Tạo product
    await prisma.product.create({
      data: {
        id: 'test-product-concurrency',
        name: 'Test Product',
        price: 100000,
        stock: 1,
        version: 0,
        slug: 'test-product-concurrency',
        category: 'test',
        images: [],
      },
    });

    // 2. Tạo users
    await prisma.user.createMany({
      data: [
        { id: 'user-a', email: 'a@test.com', password: 'hash', firstName: 'A', lastName: 'Test' },
        { id: 'user-b', email: 'b@test.com', password: 'hash', firstName: 'B', lastName: 'Test' },
      ],
    });

    // 3. Tạo carts riêng lẻ (thay vì createMany)
    const cartA = await prisma.cart.create({ data: { userId: 'user-a' } });
    const cartB = await prisma.cart.create({ data: { userId: 'user-b' } });

    // 4. Tạo cart items
    await prisma.cartItem.createMany({
      data: [
        { cartId: cartA.id, productId: 'test-product-concurrency', quantity: 1 },
        { cartId: cartB.id, productId: 'test-product-concurrency', quantity: 1 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: 'test-product-concurrency' } });
    await prisma.user.deleteMany({ where: { id: { in: ['user-a', 'user-b'] } } });
  });

  it('should prevent overselling with concurrent requests', async () => {
    const requests = [
      checkoutService.checkout('user-a', {
        idempotencyKey: 'idem-a',
        paymentMethod: 'COD',
        address: 'Address A',
        phone: '0123456789',
      }),
      checkoutService.checkout('user-b', {
        idempotencyKey: 'idem-b',
        paymentMethod: 'COD',
        address: 'Address B',
        phone: '0987654321',
      }),
    ];

    const results = await Promise.allSettled(requests);

    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failCount = results.filter((r) => r.status === 'rejected').length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);

    const product = await prisma.product.findUnique({
      where: { id: 'test-product-concurrency' },
      select: { stock: true },
    });
    expect(product?.stock).toBe(0);
  });
});