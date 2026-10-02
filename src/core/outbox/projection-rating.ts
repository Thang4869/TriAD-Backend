import type { PrismaClient } from "@prisma/client";

type ProductRatingDb = {
  review: Pick<PrismaClient["review"], "aggregate">;
  productCatalogProjection: Pick<
    PrismaClient["productCatalogProjection"],
    "updateMany"
  >;
  $queryRaw: PrismaClient["$queryRaw"];
};

export async function refreshProductRatingProjection(
  db: ProductRatingDb,
  productId: string,
): Promise<void> {
  await db.$queryRaw`
    SELECT "productId"
    FROM "product_catalog_projection"
    WHERE "productId" = ${productId}
    FOR UPDATE
  `;

  const rating = await db.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await db.productCatalogProjection.updateMany({
    where: { productId },
    data: {
      avgRating: rating._avg.rating ?? 0,
      reviewCount: rating._count.rating,
    },
  });
}

export type { ProductRatingDb };
