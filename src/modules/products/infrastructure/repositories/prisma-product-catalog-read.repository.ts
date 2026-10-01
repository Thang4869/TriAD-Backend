import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import type {
  ProductCatalogQuery,
  ProductCatalogReadPort,
  ProductCategoryCount,
} from "../../application/product-catalog-read.port";
import type { ProductListItemResponse } from "../../products.mapper";
import type { ProductFilter } from "../../domain/specifications/product-specification";

export class PrismaProductCatalogReadRepository implements ProductCatalogReadPort {
  async findMany(
    query: ProductCatalogQuery,
  ): Promise<ProductListItemResponse[]> {
    const rows = await prisma.productCatalogProjection.findMany({
      where: query.where as Prisma.ProductCatalogProjectionWhereInput,
      orderBy:
        query.orderBy as Prisma.ProductCatalogProjectionOrderByWithRelationInput,
      skip: query.skip,
      take: query.take,
    });

    return rows.map((row) => this.toListItem(row));
  }

  async count(where?: ProductFilter): Promise<number> {
    return prisma.productCatalogProjection.count({
      where: where as Prisma.ProductCatalogProjectionWhereInput,
    });
  }

  async groupByCategory(): Promise<ProductCategoryCount[]> {
    const groups = await prisma.productCatalogProjection.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    });

    return groups.map((group) => ({
      category: group.category,
      count: group._count.category,
    }));
  }

  async search(
    query: string,
    skip: number,
    take: number,
  ): Promise<ProductListItemResponse[]> {
    const rows = await prisma.productCatalogProjection.findMany({
      where: {
        isActive: true,
        searchText: {
          contains: query,
          mode: "insensitive",
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    });

    return rows.map((row) => this.toListItem(row));
  }

  async countSearch(query: string): Promise<number> {
    return prisma.productCatalogProjection.count({
      where: {
        isActive: true,
        searchText: {
          contains: query,
          mode: "insensitive",
        },
      },
    });
  }

  private toListItem(
    row: Awaited<
      ReturnType<typeof prisma.productCatalogProjection.findFirst>
    > extends infer T
      ? NonNullable<T>
      : never,
  ): ProductListItemResponse {
    return {
      id: row.productId,
      name: row.name,
      description: row.description,
      price: row.price,
      stock: row.stock,
      category: row.category,
      images: row.images,
      slug: row.slug,
      isActive: row.isActive,
      avgRating: row.avgRating,
      reviewCount: row.reviewCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
