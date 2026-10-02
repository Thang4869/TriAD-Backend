import { describe, it, expect, beforeEach, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaProductsRepository } from "@modules/products/infrastructure/repositories/prisma-products.repository";
import { Product } from "@modules/products/domain/product.entity";
import { Money } from "@shared/value-objects/money";
import { PrismaProjectionStore } from "@core/outbox/prisma-projection.store";
import { ProductUpdatedEvent } from "@shared/domain/events/product-events";

describe("PrismaProductsRepository (integration)", () => {
  const repository = new PrismaProductsRepository();

  it("create + findById + update + setActive hoạt động end-to-end", async () => {
    const product = await repository.create({
      name: "Repo CRUD Product",
      description: "d",
      price: 10,
      stock: 5,
      category: "c",
      images: [],
      slug: `crud-${Date.now()}`,
    });

    expect(product.isActive).toBe(true);
    await expect(repository.findById(product.id)).resolves.toMatchObject({
      id: product.id,
    });

    const updated = await repository.update(product.id, { price: 20 });
    expect(updated.price).toBe(20);

    const deactivated = await repository.setActive(product.id, false);
    expect(deactivated.isActive).toBe(false);
  });

  it("createWithEvents tạo product và ProductCreated outbox trong cùng transaction", async () => {
    const suffix = Date.now();
    const data = {
      name: "Atomic Create Product",
      description: "d",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `atomic-create-${suffix}`,
    };
    const entity = Product.hydrate({
      id: `product-${suffix}`,
      ...data,
      isActive: true,
    });
    entity.markCreated();

    const created = await repository.createWithEvents(data, entity);

    expect(created.id).toBe(entity.id);
    await expect(
      prisma.outboxEvent.findFirst({
        where: { aggregateId: entity.id, eventName: "ProductCreated" },
      }),
    ).resolves.toMatchObject({ aggregateId: entity.id });
    expect(entity.domainEvents).toHaveLength(0);
  });

  it("createWithEvents rollback không để lại product khi outbox thất bại", async () => {
    const suffix = Date.now();
    const data = {
      name: "Rollback Create Product",
      description: "d",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `rollback-create-${suffix}`,
    };
    const entity = Product.hydrate({
      id: `product-${suffix}`,
      ...data,
      isActive: true,
    });
    entity.markCreated();
    const failingRepository = new PrismaProductsRepository(async () => {
      throw new Error("outbox persistence failed");
    });

    await expect(
      failingRepository.createWithEvents(data, entity),
    ).rejects.toThrow("outbox persistence failed");
    await expect(
      prisma.product.findUnique({ where: { id: entity.id } }),
    ).resolves.toBeNull();
  });

  it("updateWithEvents cập nhật giá và ghi ProductPriceChanged vào outbox cùng transaction", async () => {
    const suffix = Date.now();

    const product = await repository.create({
      name: "Atomic Price Product",
      description: "d",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `atomic-price-${suffix}`,
    });

    const entity = Product.hydrate(product);
    entity.changePrice(new Money(200));

    const updated = await repository.updateWithEvents(
      product.id,
      { price: 200 },
      entity,
    );

    expect(updated.price).toBe(200);

    const persisted = await prisma.product.findUnique({
      where: { id: product.id },
    });

    expect(persisted?.price.toString()).toBe("200");

    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: product.id,
        eventName: "ProductPriceChanged",
      },
      orderBy: {
        occurredAt: "desc",
      },
    });

    expect(outboxEvent).not.toBeNull();
    expect(outboxEvent?.payload).toMatchObject({
      eventName: "ProductPriceChanged",
      aggregateId: product.id,
      metadata: {
        oldPrice: 100,
        newPrice: 200,
      },
    });

    expect(entity.domainEvents).toHaveLength(0);
  });

  it("updateWithEvents rollback product update khi persist outbox thất bại", async () => {
    const suffix = Date.now();

    const product = await repository.create({
      name: "Rollback Price Product",
      description: "d",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `rollback-price-${suffix}`,
    });

    const entity = Product.hydrate(product);
    entity.changePrice(new Money(200));

    const failingRepository = new PrismaProductsRepository(async () => {
      throw new Error("outbox persistence failed");
    });

    await expect(
      failingRepository.updateWithEvents(product.id, { price: 200 }, entity),
    ).rejects.toThrow("outbox persistence failed");

    const persisted = await prisma.product.findUnique({
      where: { id: product.id },
    });

    expect(persisted?.price.toString()).toBe("100");
  });

  it("updateWithEvents ghi ProductUpdated cho generic update và rollback khi outbox thất bại", async () => {
    const suffix = Date.now();
    const product = await repository.create({
      name: "Generic Update Product",
      description: "old",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `generic-update-${suffix}`,
    });
    const entity = Product.hydrate(product);
    entity.markUpdated();

    await repository.updateWithEvents(
      product.id,
      { name: "new name", description: "new" },
      entity,
    );

    await expect(
      prisma.outboxEvent.findFirst({
        where: { aggregateId: product.id, eventName: "ProductUpdated" },
      }),
    ).resolves.toMatchObject({ aggregateId: product.id });

    const rollbackEntity = Product.hydrate({
      ...product,
      name: "new name",
    });
    rollbackEntity.markUpdated();
    const failingRepository = new PrismaProductsRepository(async () => {
      throw new Error("outbox persistence failed");
    });

    await expect(
      failingRepository.updateWithEvents(
        product.id,
        { name: "should rollback" },
        rollbackEntity,
      ),
    ).rejects.toThrow("outbox persistence failed");

    await expect(
      prisma.product.findUnique({ where: { id: product.id } }),
    ).resolves.toMatchObject({ name: "new name" });
  });

  it("ProductUpdated refreshes catalog projection from the current product row", async () => {
    const suffix = Date.now();
    const product = await repository.create({
      name: "Projection Before",
      description: "old",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `projection-convergence-${suffix}`,
    });
    await prisma.productCatalogProjection.create({
      data: {
        productId: product.id,
        name: "Stale Projection",
        description: "stale",
        price: 1,
        stock: 99,
        category: "stale",
        images: [],
        slug: `projection-stale-${suffix}`,
        isActive: true,
        searchText: "Stale Projection stale",
        createdAt: product.createdAt,
      },
    });

    const entity = Product.hydrate(product);
    entity.markUpdated();
    await repository.updateWithEvents(
      product.id,
      { name: "Projection After", images: ["new.jpg"] },
      entity,
    );

    await new PrismaProjectionStore().upsertProduct(
      new ProductUpdatedEvent(product.id),
    );

    await expect(
      prisma.productCatalogProjection.findUnique({
        where: { productId: product.id },
      }),
    ).resolves.toMatchObject({
      name: "Projection After",
      stock: 5,
      images: ["new.jpg"],
    });
  });

  it("setActiveWithEvents cập nhật trạng thái và ghi ProductDeactivated vào outbox cùng transaction", async () => {
    const suffix = Date.now();

    const product = await repository.create({
      name: "Atomic Deactivate Product",
      description: "d",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `atomic-deactivate-${suffix}`,
    });

    const entity = Product.hydrate(product);
    entity.deactivate();

    const updated = await repository.setActiveWithEvents(
      product.id,
      false,
      entity,
    );

    expect(updated.isActive).toBe(false);

    const persisted = await prisma.product.findUnique({
      where: { id: product.id },
    });

    expect(persisted?.isActive).toBe(false);

    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: product.id,
        eventName: "ProductDeactivated",
      },
      orderBy: {
        occurredAt: "desc",
      },
    });

    expect(outboxEvent).not.toBeNull();
    expect(outboxEvent?.payload).toMatchObject({
      eventName: "ProductDeactivated",
      aggregateId: product.id,
    });

    expect(entity.domainEvents).toHaveLength(0);
  });

  it("setActiveWithEvents rollback trạng thái khi persist outbox thất bại", async () => {
    const suffix = Date.now();

    const product = await repository.create({
      name: "Rollback Deactivate Product",
      description: "d",
      price: 100,
      stock: 5,
      category: "atomic",
      images: [],
      slug: `rollback-deactivate-${suffix}`,
    });

    const entity = Product.hydrate(product);
    entity.deactivate();

    const failingRepository = new PrismaProductsRepository(async () => {
      throw new Error("outbox persistence failed");
    });

    await expect(
      failingRepository.setActiveWithEvents(product.id, false, entity),
    ).rejects.toThrow("outbox persistence failed");

    const persisted = await prisma.product.findUnique({
      where: { id: product.id },
    });

    expect(persisted?.isActive).toBe(true);
  });

  it("findManyWithRatings trả về sản phẩm kèm reviews, hỗ trợ where/orderBy/skip/take", async () => {
    const suffix = Date.now();
    const product = await prisma.product.create({
      data: {
        name: "Rated Product",
        description: "d",
        price: 50,
        stock: 10,
        category: `rated-${suffix}`,
        images: [],
        slug: `rated-product-${suffix}`,
      },
    });

    await repository.create({
      name: "Other Product",
      description: "d",
      price: 60,
      stock: 10,
      category: `rated-${suffix}`,
      images: [],
      slug: `other-product-${suffix}`,
    });

    const user = await prisma.user.create({
      data: {
        email: `products-repo-${suffix}@test.com`,
        password: "h",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });
    await prisma.review.create({
      data: {
        productId: product.id,
        userId: user.id,
        rating: 5,
        comment: "great",
      },
    });

    const results = await repository.findManyWithRatings({
      where: { category: `rated-${suffix}` },
      orderBy: { createdAt: "asc" },
      skip: 0,
      take: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].reviews).toEqual([{ rating: 5 }]);
  });

  it("count trả đúng số lượng sản phẩm khớp điều kiện where", async () => {
    const suffix = Date.now();
    await prisma.product.createMany({
      data: [
        {
          name: "Count A",
          description: "d",
          price: 1,
          stock: 1,
          category: `count-${suffix}`,
          images: [],
          slug: `count-a-${suffix}`,
        },
        {
          name: "Count B",
          description: "d",
          price: 1,
          stock: 1,
          category: `count-${suffix}`,
          images: [],
          slug: `count-b-${suffix}`,
        },
      ],
    });

    const total = await repository.count({ category: `count-${suffix}` });
    expect(total).toBe(2);
  });

  it("findByIdWithReviews trả product kèm reviews đầy đủ thông tin user (bao gồm email)", async () => {
    const suffix = Date.now();
    const product = await prisma.product.create({
      data: {
        name: "Detail Product",
        description: "d",
        price: 10,
        stock: 5,
        category: "c",
        images: [],
        slug: `detail-product-${suffix}`,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `detail-repo-${suffix}@test.com`,
        password: "h",
        firstName: "Jane",
        lastName: "Doe",
        isVerified: true,
      },
    });
    await prisma.review.create({
      data: {
        productId: product.id,
        userId: user.id,
        rating: 4,
        comment: "nice",
      },
    });

    const result = await repository.findByIdWithReviews(product.id);

    expect(result?.reviews).toHaveLength(1);
    expect(result?.reviews[0].user).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      email: `detail-repo-${suffix}@test.com`,
    });
  });

  it("findByIdWithReviews trả null khi sản phẩm không tồn tại", async () => {
    await expect(
      repository.findByIdWithReviews("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();
  });

  it("findBySlugWithReviews trả product kèm reviews nhưng KHÔNG bao gồm email của user", async () => {
    const suffix = Date.now();
    const product = await prisma.product.create({
      data: {
        name: "Slug Detail Product",
        description: "d",
        price: 10,
        stock: 5,
        category: "c",
        images: [],
        slug: `slug-detail-${suffix}`,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `slug-detail-${suffix}@test.com`,
        password: "h",
        firstName: "John",
        lastName: "Smith",
        isVerified: true,
      },
    });
    await prisma.review.create({
      data: {
        productId: product.id,
        userId: user.id,
        rating: 3,
        comment: "ok",
      },
    });

    const result = await repository.findBySlugWithReviews(product.slug);

    expect(result?.reviews).toHaveLength(1);
    expect(result?.reviews[0].user).toMatchObject({
      firstName: "John",
      lastName: "Smith",
    });
    expect((result?.reviews[0].user as any).email).toBeUndefined();
  });

  it("findBySlugWithReviews trả null khi slug không tồn tại", async () => {
    await expect(
      repository.findBySlugWithReviews(`no-such-slug-${Date.now()}`),
    ).resolves.toBeNull();
  });

  it("findManyAdmin trả về TẤT CẢ sản phẩm khớp điều kiện, kể cả sản phẩm inactive", async () => {
    const suffix = Date.now();
    await prisma.product.createMany({
      data: [
        {
          name: "Admin Active",
          description: "d",
          price: 1,
          stock: 1,
          category: `admin-${suffix}`,
          images: [],
          slug: `admin-active-${suffix}`,
          isActive: true,
        },
        {
          name: "Admin Inactive",
          description: "d",
          price: 1,
          stock: 1,
          category: `admin-${suffix}`,
          images: [],
          slug: `admin-inactive-${suffix}`,
          isActive: false,
        },
      ],
    });

    const results = await repository.findManyAdmin({
      where: { category: `admin-${suffix}` },
      orderBy: { createdAt: "asc" },
      skip: 0,
      take: 10,
    });

    expect(results).toHaveLength(2);
  });

  it("existsAndActive trả false cho id không tồn tại", async () => {
    await expect(
      repository.existsAndActive("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBe(false);
  });

  it("findBySlugId trả null khi slug chưa tồn tại", async () => {
    await expect(
      repository.findBySlugId(`no-such-slug-${Date.now()}`),
    ).resolves.toBeNull();
  });

  it("groupByCategory chỉ đếm sản phẩm active", async () => {
    const suffix = Date.now();
    await prisma.product.createMany({
      data: [
        {
          name: "GC1",
          description: "d",
          price: 1,
          stock: 1,
          category: `cat-${suffix}`,
          images: [],
          slug: `gc1-${suffix}`,
          isActive: true,
        },
        {
          name: "GC2",
          description: "d",
          price: 1,
          stock: 1,
          category: `cat-${suffix}`,
          images: [],
          slug: `gc2-${suffix}`,
          isActive: false,
        },
      ],
    });

    const groups = await repository.groupByCategory();
    const target = groups.find((g) => g.category === `cat-${suffix}`);

    expect(target?.count).toBe(1);
  });

  it("findById should return null when product does not exist", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const result = await repository.findById(nonExistentId);
    expect(result).toBeNull();
  });

  describe("searchFullText", () => {
    beforeEach(async () => {
      const suffix = Date.now();
      await prisma.product.createMany({
        data: [
          {
            name: "Wireless Mouse",
            description: "Ergonomic wireless mouse for office use",
            price: 15,
            stock: 10,
            category: "electronics",
            images: [],
            slug: `search-mouse-${suffix}`,
          },
          {
            name: "Mechanical Keyboard",
            description: "RGB mechanical keyboard",
            price: 60,
            stock: 5,
            category: "electronics",
            images: [],
            slug: `search-keyboard-${suffix}`,
          },
          {
            name: "Office Chair",
            description: "Comfortable ergonomic chair",
            price: 120,
            stock: 3,
            category: "furniture",
            images: [],
            slug: `search-chair-${suffix}`,
          },
        ],
      });
    });

    it("countFullTextSearch returns 0 when no products match", async () => {
      const count = await repository.countFullTextSearch("nonexistent-keyword");
      expect(count).toBe(0);
    });

    it("trả về sản phẩm khớp keyword trong name hoặc description", async () => {
      const results = await repository.searchFullText("wireless", 0, 10);

      expect(results.some((r) => r.name.includes("Wireless"))).toBe(true);
    });

    it("trả về sản phẩm khớp qua từ khoá xuất hiện trong description dù không có trong name", async () => {
      const results = await repository.searchFullText("ergonomic", 0, 10);

      const names = results.map((r) => r.name);
      expect(names.some((n) => n.includes("Wireless"))).toBe(true);
      expect(names.some((n) => n.includes("Office"))).toBe(true);
    });

    it("countFullTextSearch trả về số đếm khớp với toàn bộ kết quả searchFullText", async () => {
      const count = await repository.countFullTextSearch("ergonomic");
      const results = await repository.searchFullText("ergonomic", 0, count);

      expect(count).toBeGreaterThan(0);
      expect(results).toHaveLength(count);
    });

    it("trả mảng rỗng khi không có sản phẩm nào khớp", async () => {
      const results = await repository.searchFullText(
        "nonexistent-keyword-xyz",
        0,
        10,
      );
      expect(results).toHaveLength(0);
    });
    it("trả về 0 khi tham số search là chuỗi rỗng", async () => {
      const countEmpty = await repository.countFullTextSearch("");

      expect(countEmpty).toBe(0);
    });

    it("trả về mảng rỗng khi searchFullText với chuỗi rỗng và đủ tham số pagination", async () => {
      const results = await repository.searchFullText("", 0, 10);

      expect(results).toEqual([]);
    });

    it("countFullTextSearch returns 0 when $queryRaw returns empty array (edge case for ?? operator)", async () => {
      const originalQueryRaw = prisma.$queryRaw;
      (prisma as any).$queryRaw = vi.fn().mockResolvedValue([]);

      const count = await repository.countFullTextSearch("anything");
      expect(count).toBe(0);

      (prisma as any).$queryRaw = originalQueryRaw;
    });
  });
});
