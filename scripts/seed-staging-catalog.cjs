"use strict";

// Deliberately independent of scripts/seed.ts: no deletes, accounts or passwords.
// Node + the production Prisma client are sufficient inside the Docker image.
const DATABASE_NAME = "triad_staging";
const CATALOG = [
  {
    id: "5eb6bfc1-940a-4d16-8d86-7dc5f577f101",
    slug: "staging-triad-storage-1000ml",
    name: "[STAGING] TriAD Storage Container 1000ml",
    description:
      "Staging fixture for cart and COD checkout testing. Not for sale.",
    price: 150000,
    stock: 12,
    category: "glass",
    images: ["/images/21.jpg"],
  },
  {
    id: "5eb6bfc1-940a-4d16-8d86-7dc5f577f102",
    slug: "staging-triad-storage-400ml",
    name: "[STAGING] TriAD Storage Container 400ml",
    description:
      "Staging fixture for cart and COD checkout testing. Not for sale.",
    price: 110000,
    stock: 12,
    category: "glass",
    images: ["/images/22.jpg"],
  },
  {
    id: "5eb6bfc1-940a-4d16-8d86-7dc5f577f103",
    slug: "staging-triad-storage-800ml",
    name: "[STAGING] TriAD Storage Container 800ml",
    description:
      "Staging fixture for cart and COD checkout testing. Not for sale.",
    price: 130000,
    stock: 12,
    category: "glass",
    images: ["/images/23.jpg"],
  },
];

class SeedGuardError extends Error {}

function assertStagingSeedEnabled(env) {
  if (env.TRIAD_DEPLOYMENT_ENV !== "staging") {
    throw new SeedGuardError(
      "Refusing catalog seed: TRIAD_DEPLOYMENT_ENV must be staging.",
    );
  }
  if (env.TRIAD_SEED_STAGING_CATALOG !== "true") {
    throw new SeedGuardError(
      "Refusing catalog seed: TRIAD_SEED_STAGING_CATALOG must be true.",
    );
  }
}

async function seedStagingCatalog(db, env = process.env) {
  assertStagingSeedEnabled(env);

  return db.$transaction(
    async (tx) => {
      const [database] = await tx.$queryRaw`SELECT current_database() AS name`;
      if (database?.name !== DATABASE_NAME) {
        throw new SeedGuardError(
          "Refusing catalog seed: connected database must be triad_staging.",
        );
      }

      const insertedProducts = await tx.product.createMany({
        data: CATALOG,
        skipDuplicates: true,
      });
      const ids = CATALOG.map((product) => product.id);
      const products = await tx.product.findMany({
        where: { id: { in: ids } },
        include: { reviews: { select: { rating: true } } },
      });
      const expectedSlugs = new Map(
        CATALOG.map((product) => [product.id, product.slug]),
      );
      if (
        products.length !== CATALOG.length ||
        products.some(
          (product) => expectedSlugs.get(product.id) !== product.slug,
        )
      ) {
        throw new SeedGuardError(
          "Refusing catalog seed: reserved product identifiers conflict with existing data.",
        );
      }

      // Public catalog queries read this projection, not the products table.
      // Copy persisted values so retries never reset stock, prices or versions.
      const insertedProjections = await tx.productCatalogProjection.createMany({
        data: products.map((product) => ({
          productId: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          category: product.category,
          images: product.images,
          slug: product.slug,
          isActive: product.isActive,
          avgRating:
            product.reviews.length === 0
              ? 0
              : product.reviews.reduce(
                  (sum, review) => sum + review.rating,
                  0,
                ) / product.reviews.length,
          reviewCount: product.reviews.length,
          searchText: `${product.name} ${product.description ?? ""} ${product.category}`,
          sourceVersion: product.version,
          createdAt: product.createdAt,
        })),
        skipDuplicates: true,
      });
      const projections = await tx.productCatalogProjection.findMany({
        where: { productId: { in: ids } },
        select: { productId: true, slug: true },
      });
      if (
        projections.length !== CATALOG.length ||
        projections.some(
          (projection) =>
            expectedSlugs.get(projection.productId) !== projection.slug,
        )
      ) {
        throw new SeedGuardError(
          "Refusing catalog seed: reserved projection identifiers conflict with existing data.",
        );
      }

      return {
        productsCreated: insertedProducts.count,
        projectionsCreated: insertedProjections.count,
      };
    },
    { maxWait: 10000, timeout: 15000 },
  );
}

async function main() {
  // Check the opt-in before constructing a client or opening a connection.
  assertStagingSeedEnabled(process.env);
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ log: [] });
  try {
    const result = await seedStagingCatalog(db);
    console.log(`Staging catalog seed complete: ${JSON.stringify(result)}`);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Prisma errors can contain connection details; never print them here.
    console.error(
      error instanceof SeedGuardError
        ? error.message
        : "Staging catalog seed failed. Check database availability and schema; credentials are not logged.",
    );
    process.exitCode = 1;
  });
}

module.exports = { seedStagingCatalog };
