import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@core/database/prisma';
import { PrismaReviewsRepository } from '@modules/reviews/reviews.repository';

describe('PrismaReviewsRepository (integration)', () => {
  const repository = new PrismaReviewsRepository();
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `reviews-repo-${Date.now()}@test.com`,
        password: 'h',
        firstName: 'A',
        lastName: 'B',
        isVerified: true,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        name: 'Review Product',
        description: 'd',
        price: 30,
        stock: 10,
        category: 'c',
        slug: `review-p-${Date.now()}`,
        images: [],
      },
    });
    productId = product.id;
  });

  it('create + findByUserAndProduct trả về đúng review vừa tạo', async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 5,
      comment: 'Great!',
    });

    await expect(repository.findByUserAndProduct(userId, productId)).resolves.toMatchObject({
      id: review.id,
    });
    expect(review.user.id).toBe(userId);
  });

  it('findByProduct + countByProduct chỉ tính review của đúng product', async () => {
    const otherProduct = await prisma.product.create({
      data: {
        name: 'Other',
        description: 'd',
        price: 1,
        stock: 1,
        category: 'c',
        slug: `other-p-${Date.now()}`,
        images: [],
      },
    });
    await repository.create({ userId, productId, rating: 4, comment: 'Good' });
    await repository.create({
      userId,
      productId: otherProduct.id,
      rating: 2,
      comment: 'Meh',
    });

    const reviews = await repository.findByProduct(productId, 0, 10);
    const count = await repository.countByProduct(productId);

    expect(reviews).toHaveLength(1);
    expect(count).toBe(1);
  });

  it('productExists phân biệt đúng product tồn tại/không tồn tại', async () => {
    await expect(repository.productExists(productId)).resolves.toBe(true);
    await expect(repository.productExists('00000000-0000-0000-0000-000000000000')).resolves.toBe(
      false,
    );
  });

  it('delete xoá đúng review theo id', async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 3,
      comment: 'Ok',
    });

    await repository.delete(review.id);

    await expect(repository.findById(review.id)).resolves.toBeNull();
  });

  it('findAllAdmin trả kèm thông tin product, không lọc theo user/product cụ thể', async () => {
    await repository.create({
      userId,
      productId,
      rating: 5,
      comment: 'Great!',
    });

    const all = await repository.findAllAdmin(0, 10);

    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0].product).toBeDefined();
  });
});
