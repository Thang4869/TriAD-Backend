import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaProductsRepository } from "@modules/products/products.repository";

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

    it("trả về sản phẩm khớp keyword trong name hoặc description", async () => {
      const results = await repository.searchFullText("wireless", 0, 10);

      expect(results.some((r) => r.name === "Wireless Mouse")).toBe(true);
    });

    it("trả về sản phẩm khớp qua từ khoá xuất hiện trong description dù không có trong name", async () => {
      const results = await repository.searchFullText("ergonomic", 0, 10);

      const names = results.map((r) => r.name);
      expect(names).toContain("Wireless Mouse");
      expect(names).toContain("Office Chair");
    });

    it("countFullTextSearch trả về số đếm khớp với độ dài mảng searchFullText không phân trang", async () => {
      const count = await repository.countFullTextSearch("ergonomic");
      const results = await repository.searchFullText("ergonomic", 0, 50);

      expect(count).toBe(results.length);
      expect(count).toBeGreaterThan(0);
    });

    it("trả mảng rỗng khi không có sản phẩm nào khớp", async () => {
      const results = await repository.searchFullText(
        "nonexistent-keyword-xyz",
        0,
        10,
      );
      expect(results).toHaveLength(0);
    });
  });
});
