import { Prisma, type PrismaClient } from "@prisma/client";

type OrderHistoryWriterDb = {
  orderHistoryProjection: Pick<
    PrismaClient["orderHistoryProjection"],
    "updateMany" | "create" | "findUnique"
  >;
};
type ProductCatalogWriterDb = {
  productCatalogProjection: Pick<
    PrismaClient["productCatalogProjection"],
    "updateMany" | "create" | "findUnique"
  >;
};

export async function writeOrderHistoryProjection(
  db: OrderHistoryWriterDb,
  data: Prisma.OrderHistoryProjectionUncheckedCreateInput,
): Promise<void> {
  const { orderId, sourceVersion: rawSourceVersion, ...updateData } = data;
  const sourceVersion = requireSourceVersion(rawSourceVersion);
  const updated = await db.orderHistoryProjection.updateMany({
    where: { orderId, sourceVersion: { lt: sourceVersion } },
    data: { ...updateData, sourceVersion },
  });

  if (updated.count > 0) return;

  try {
    await db.orderHistoryProjection.create({ data });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const retried = await db.orderHistoryProjection.updateMany({
      where: { orderId, sourceVersion: { lt: sourceVersion } },
      data: { ...updateData, sourceVersion },
    });
    if (retried.count > 0) return;

    const existing = await db.orderHistoryProjection.findUnique({
      where: { orderId },
      select: { sourceVersion: true },
    });
    if (existing && existing.sourceVersion >= sourceVersion) return;
    throw error;
  }
}

export async function writeProductCatalogProjection(
  db: ProductCatalogWriterDb,
  data: Prisma.ProductCatalogProjectionUncheckedCreateInput,
): Promise<void> {
  const { productId, sourceVersion: rawSourceVersion, ...updateData } = data;
  const sourceVersion = requireSourceVersion(rawSourceVersion);
  const updated = await db.productCatalogProjection.updateMany({
    where: { productId, sourceVersion: { lt: sourceVersion } },
    data: { ...updateData, sourceVersion },
  });

  if (updated.count > 0) return;

  try {
    await db.productCatalogProjection.create({ data });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const retried = await db.productCatalogProjection.updateMany({
      where: { productId, sourceVersion: { lt: sourceVersion } },
      data: { ...updateData, sourceVersion },
    });
    if (retried.count > 0) return;

    const existing = await db.productCatalogProjection.findUnique({
      where: { productId },
      select: { sourceVersion: true },
    });
    if (existing && existing.sourceVersion >= sourceVersion) return;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function requireSourceVersion(sourceVersion: number | undefined): number {
  if (sourceVersion === undefined) {
    throw new Error("Versioned projection snapshot is required");
  }
  return sourceVersion;
}
