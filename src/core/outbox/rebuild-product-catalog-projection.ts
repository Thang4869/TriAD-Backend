import type { PrismaClient } from "@prisma/client";

const DEFAULT_BATCH_SIZE = 100;

type RebuildProductCatalogProjectionDb = Pick<
  PrismaClient,
  "product" | "productCatalogProjection" | "$transaction"
>;

export async function rebuildProductCatalogProjection(
  db: RebuildProductCatalogProjectionDb,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  let cursor: string | undefined;
  let processed = 0;
  let hasMore = true;

  while (hasMore) {
    const products = await db.product.findMany({
      take: batchSize,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { id: "asc" },
      include: {
        reviews: {
          select: {
            rating: true,
          },
        },
      },
    });

    if (products.length === 0) {
      hasMore = false;
      continue;
    }

    const operations = products.map((product) => {
      const reviewCount = product.reviews.length;
      const avgRating =
        reviewCount === 0
          ? 0
          : product.reviews.reduce((sum, review) => sum + review.rating, 0) /
            reviewCount;

      const data = {
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        category: product.category,
        images: product.images,
        slug: product.slug,
        isActive: product.isActive,
        avgRating,
        reviewCount,
        searchText: `${product.name} ${product.description ?? ""} ${product.category}`,
        sourceVersion: product.version,
        createdAt: product.createdAt,
      };

      return db.productCatalogProjection.upsert({
        where: {
          productId: product.id,
        },
        create: {
          productId: product.id,
          ...data,
        },
        update: data,
      });
    });

    await db.$transaction(operations);

    processed += products.length;
    cursor = products[products.length - 1].id;
  }

  return processed;
}
