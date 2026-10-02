import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import { persistDomainEvents } from "@core/outbox/persist-domain-events";
import type { Product } from "../../domain/product.entity";
import type {
  CategoryCount,
  CreateProductData,
  FullTextSearchResult,
  IProductsRepository,
  ProductListQuery,
  UpdateProductData,
} from "../../application/ports/products.repository.port";
import type {
  ProductIdRecord,
  ProductRecord,
  ProductWithFullReviews,
  ProductWithRatingReviews,
  ProductWithShortReviews,
} from "../../application/product-models";
import type { ProductFilter } from "../../domain/specifications/product-specification";
import { toSafeMoneyNumber } from "@shared/infrastructure/money-number";

// ---------- Prisma implementation ----------

type PersistDomainEvents = typeof persistDomainEvents;

export class PrismaProductsRepository implements IProductsRepository {
  constructor(
    private readonly persistEvents: PersistDomainEvents = persistDomainEvents,
  ) {}
  async findManyWithRatings(
    query: ProductListQuery,
  ): Promise<ProductWithRatingReviews[]> {
    const products = await prisma.product.findMany({
      where: query.where,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
      include: {
        reviews: {
          select: { rating: true },
        },
      },
    });
    return products.map((product) => ({
      ...product,
      price: toSafeMoneyNumber(product.price),
    }));
  }

  async count(where: ProductFilter): Promise<number> {
    return prisma.product.count({
      where: where as Prisma.ProductWhereInput,
    });
  }

  async findByIdWithReviews(
    id: string,
  ): Promise<ProductWithFullReviews | null> {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return product
      ? {
          ...product,
          price: toSafeMoneyNumber(product.price),
        }
      : null;
  }

  async findBySlugWithReviews(
    slug: string,
  ): Promise<ProductWithShortReviews | null> {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        reviews: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return product
      ? {
          ...product,
          price: toSafeMoneyNumber(product.price),
        }
      : null;
  }

  async findBySlugId(slug: string): Promise<ProductIdRecord | null> {
    return prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
  }

  async groupByCategory(): Promise<CategoryCount[]> {
    const groups = await prisma.product.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    });

    return groups.map((g) => ({
      category: g.category,
      count: g._count.category,
    }));
  }

  async findManyAdmin(query: ProductListQuery): Promise<ProductRecord[]> {
    const products = await prisma.product.findMany({
      where: query.where,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    });
    return products.map((product) => ({
      ...product,
      price: toSafeMoneyNumber(product.price),
    }));
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const product = await prisma.product.findUnique({ where: { id } });
    return product
      ? { ...product, price: toSafeMoneyNumber(product.price) }
      : null;
  }

  async create(data: CreateProductData): Promise<ProductRecord> {
    const product = await prisma.product.create({
      data: { ...data, isActive: true },
    });
    return { ...product, price: toSafeMoneyNumber(product.price) };
  }

  async createWithEvents(
    data: CreateProductData,
    aggregate: Product,
  ): Promise<ProductRecord> {
    return prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          id: aggregate.id,
          ...data,
          isActive: true,
        },
      });

      await this.persistEvents(
        tx,
        [aggregate],
        new Map([[aggregate.id, created.version]]),
      );

      return { ...created, price: toSafeMoneyNumber(created.price) };
    });
  }

  async update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    const product = await prisma.product.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
    return { ...product, price: toSafeMoneyNumber(product.price) };
  }

  async updateWithEvents(
    id: string,
    data: UpdateProductData,
    aggregate: Product,
  ): Promise<ProductRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });

      await this.persistEvents(
        tx,
        [aggregate],
        new Map([[id, updated.version]]),
      );

      return { ...updated, price: toSafeMoneyNumber(updated.price) };
    });
  }

  async setActive(id: string, isActive: boolean): Promise<ProductRecord> {
    const product = await prisma.product.update({
      where: { id },
      data: { isActive, version: { increment: 1 } },
    });
    return { ...product, price: toSafeMoneyNumber(product.price) };
  }

  async setActiveWithEvents(
    id: string,
    isActive: boolean,
    aggregate: Product,
  ): Promise<ProductRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { isActive, version: { increment: 1 } },
      });

      await this.persistEvents(
        tx,
        [aggregate],
        new Map([[id, updated.version]]),
      );

      return { ...updated, price: toSafeMoneyNumber(updated.price) };
    });
  }

  async existsAndActive(id: string): Promise<boolean> {
    const product = await prisma.product.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    return product !== null;
  }

  async searchFullText(
    query: string,
    skip: number,
    take: number,
  ): Promise<FullTextSearchResult[]> {
    const products = await prisma.$queryRaw<FullTextSearchResult[]>`
      SELECT
        "id", "name", "description", "price", "stock",
        "category", "images", "slug",
        ts_rank("searchVector", plainto_tsquery('simple', ${query})) AS rank
      FROM "products"
      WHERE "isActive" = true
        AND "searchVector" @@ plainto_tsquery('simple', ${query})
      ORDER BY rank DESC
      OFFSET ${skip} LIMIT ${take}
    `;
    return products.map((product) => ({
      ...product,
      price: toSafeMoneyNumber(product.price),
    }));
  }

  async countFullTextSearch(query: string): Promise<number> {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "products"
      WHERE "isActive" = true
        AND "searchVector" @@ plainto_tsquery('simple', ${query})
    `;
    return Number(result[0]?.count ?? 0);
  }
}
