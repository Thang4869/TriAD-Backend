import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaReviewsRepository } from "@modules/reviews/infrastructure/repositories/prisma-reviews.repository";

describe("PrismaReviewsRepository (integration)", () => {
  const repository = new PrismaReviewsRepository();
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `reviews-repo-${Date.now()}@test.com`,
        password: "h",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        name: "Review Product",
        description: "d",
        price: 30,
        stock: 10,
        category: "c",
        slug: `review-p-${Date.now()}`,
        images: [],
      },
    });
    productId = product.id;
  });

  it("create + findByUserAndProduct trả về đúng review vừa tạo", async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 5,
      comment: "Great!",
    });

    await expect(
      repository.findByUserAndProduct(userId, productId),
    ).resolves.toMatchObject({
      id: review.id,
    });
    expect(review.user.id).toBe(userId);
  });

  it("findByProduct + countByProduct chỉ tính review của đúng product", async () => {
    const otherProduct = await prisma.product.create({
      data: {
        name: "Other",
        description: "d",
        price: 1,
        stock: 1,
        category: "c",
        slug: `other-p-${Date.now()}`,
        images: [],
      },
    });
    await repository.create({ userId, productId, rating: 4, comment: "Good" });
    await repository.create({
      userId,
      productId: otherProduct.id,
      rating: 2,
      comment: "Meh",
    });

    const reviews = await repository.findByProduct(productId, 0, 10);
    const count = await repository.countByProduct(productId);

    expect(reviews).toHaveLength(1);
    expect(count).toBe(1);
  });

  it("productExists phân biệt đúng product tồn tại/không tồn tại", async () => {
    await expect(repository.productExists(productId)).resolves.toBe(true);
    await expect(
      repository.productExists("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBe(false);
  });

  it("delete xoá đúng review theo id", async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 3,
      comment: "Ok",
    });

    await repository.delete(review.id);

    await expect(repository.findById(review.id)).resolves.toBeNull();
  });

  it("findAllAdmin trả kèm thông tin product, không lọc theo user/product cụ thể", async () => {
    await repository.create({
      userId,
      productId,
      rating: 5,
      comment: "Great!",
    });

    const all = await repository.findAllAdmin(0, 10);

    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0].product).toBeDefined();
  });

  it("count returns total number of reviews", async () => {
    await repository.create({ userId, productId, rating: 5, comment: "Great" });
    const product2 = await prisma.product.create({
      data: {
        name: "Review Product 2",
        description: "d",
        price: 30,
        stock: 10,
        category: "c",
        slug: `review-p2-${Date.now()}`,
        images: [],
      },
    });
    await repository.create({
      userId,
      productId: product2.id,
      rating: 4,
      comment: "Good",
    });
    const total = await repository.count();
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("persists review creation and outbox event atomically", async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 5,
      comment: "Atomic review",
    });

    expect(review.id).toBeDefined();

    const event = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: productId,
        eventName: "ReviewCreated",
      },
    });

    expect(event).not.toBeNull();
    expect(event?.publishedAt).toBeNull();
  });

  it("rolls back review creation when outbox persistence fails", async () => {
    const failingRepository = new PrismaReviewsRepository(async () => {
      throw new Error("Simulated outbox failure");
    });

    await expect(
      failingRepository.create({
        userId,
        productId,
        rating: 5,
        comment: "Rollback test",
      }),
    ).rejects.toThrow("Simulated outbox failure");

    const reviews = await prisma.review.findMany({
      where: { userId, productId },
    });

    expect(reviews).toHaveLength(0);
  });

  it("persists ReviewDeleted event atomically with review deletion", async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 5,
      comment: "Review to delete",
    });

    await repository.delete(review.id);

    const deletedReview = await prisma.review.findUnique({
      where: { id: review.id },
    });

    expect(deletedReview).toBeNull();

    const events = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: productId,
        eventName: "ReviewDeleted",
      },
    });

    expect(events).toHaveLength(1);

    expect(events[0]).toMatchObject({
      eventName: "ReviewDeleted",
      aggregateId: productId,
      publishedAt: null,
      attempts: 0,
    });

    expect(events[0].payload).toMatchObject({
      schemaVersion: 1,
      eventName: "ReviewDeleted",
      aggregateId: productId,
    });
  });

  it("rolls back review deletion when outbox persistence fails", async () => {
    const review = await repository.create({
      userId,
      productId,
      rating: 4,
      comment: "Review must survive rollback",
    });

    const failingRepository = new PrismaReviewsRepository(async () => {
      throw new Error("Simulated outbox failure");
    });

    await expect(failingRepository.delete(review.id)).rejects.toThrow(
      "Simulated outbox failure",
    );

    const persistedReview = await prisma.review.findUnique({
      where: { id: review.id },
    });

    expect(persistedReview).toMatchObject({
      id: review.id,
      userId,
      productId,
      rating: 4,
    });

    const deletedEventCount = await prisma.outboxEvent.count({
      where: {
        aggregateId: productId,
        eventName: "ReviewDeleted",
      },
    });

    expect(deletedEventCount).toBe(0);
  });
});
