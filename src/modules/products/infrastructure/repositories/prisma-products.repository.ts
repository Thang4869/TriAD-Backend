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

// ---------- Prisma implementation ----------

type PersistDomainEvents = typeof persistDomainEvents;

export class PrismaProductsRepository implements IProductsRepository {
  constructor(
    private readonly persistEvents: PersistDomainEvents = persistDomainEvents,
  ) {}
  async findManyWithRatings(
    query: ProductListQuery,
  ): Promise<ProductWithRatingReviews[]> {
    return prisma.product.findMany({
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
  }

  async count(where: ProductFilter): Promise<number> {
    return prisma.product.count({
      where: where as Prisma.ProductWhereInput,
    });
  }

  async findByIdWithReviews(
    id: string,
  ): Promise<ProductWithFullReviews | null> {
    return prisma.product.findUnique({
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
  }

  async findBySlugWithReviews(
    slug: string,
  ): Promise<ProductWithShortReviews | null> {
    return prisma.product.findUnique({
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
    return prisma.product.findMany({
      where: query.where,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    });
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return prisma.product.findUnique({ where: { id } });
  }

  async create(data: CreateProductData): Promise<ProductRecord> {
    return prisma.product.create({
      data: { ...data, isActive: true },
    });
  }

  async update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    return prisma.product.update({ where: { id }, data });
  }

  async updateWithEvents(
    id: string,
    data: UpdateProductData,
    aggregate: Product,
  ): Promise<ProductRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data,
      });

      await this.persistEvents(tx, [aggregate]);

      return updated;
    });
  }

  async setActive(id: string, isActive: boolean): Promise<ProductRecord> {
    return prisma.product.update({ where: { id }, data: { isActive } });
  }

  async existsAndActive(id: string): Promise<boolean> {
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    return product !== null;
  }

  async searchFullText(
    query: string,
    skip: number,
    take: number,
  ): Promise<FullTextSearchResult[]> {
    return prisma.$queryRaw<FullTextSearchResult[]>`
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
