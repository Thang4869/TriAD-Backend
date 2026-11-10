"use strict";

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const DATABASE_NAME = "triad_perf";
const CONFIRMATION = "I_UNDERSTAND_LOCAL_BENCHMARK_DATA";

function readConfiguration(env = process.env) {
  if (env.TRIAD_PERF_CONFIRM !== CONFIRMATION) {
    throw new Error("Refusing to seed: TRIAD_PERF_CONFIRM confirmation is required.");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production environment.");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must point to the dedicated triad_perf database.");
  }
  if (databaseUrl.pathname.replace(/^\//, "") !== DATABASE_NAME) {
    throw new Error("Refusing to seed: database name must be triad_perf.");
  }

  const runId = env.TRIAD_PERF_RUN_ID || new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  if (!/^[a-zA-Z0-9-]{8,32}$/.test(runId)) {
    throw new Error("TRIAD_PERF_RUN_ID must contain 8-32 letters, digits or hyphens.");
  }

  const userCount = Number(env.TRIAD_PERF_USERS || 10);
  if (!Number.isInteger(userCount) || userCount < 1 || userCount > 50) {
    throw new Error("TRIAD_PERF_USERS must be an integer between 1 and 50.");
  }

  const password = env.TRIAD_PERF_PASSWORD;
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("TRIAD_PERF_PASSWORD must contain at least 12 characters.");
  }

  return { runId, userCount, password };
}

async function seedBenchmarkFixtures(db, env = process.env) {
  const { runId, userCount, password } = readConfiguration(env);
  const passwordHash = await bcrypt.hash(password, 12);
  const productIds = [];
  const emails = [];

  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe("SELECT current_database() AS name");
    if (rows[0]?.name !== DATABASE_NAME) {
      throw new Error("Refusing to seed: connected database must be triad_perf.");
    }

    const products = [];
    for (let index = 0; index < userCount; index += 1) {
      const email = "perf-" + runId + "-" + (index + 1) + "@example.test";
      const user = await tx.user.upsert({
        where: { email },
        create: {
          id: randomUUID(),
          email,
          password: passwordHash,
          firstName: "Benchmark",
          lastName: "User " + (index + 1),
          phone: "0900000000",
          role: "USER",
          isVerified: true,
        },
        update: { password: passwordHash, isVerified: true },
      });
      await tx.cart.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });

      const productId = randomUUID();
      const slug = "triad-perf-" + runId + "-user-" + (index + 1);
      const product = await tx.product.upsert({
        where: { slug },
        create: {
          id: productId,
          name: "[PERF] Independent SKU " + (index + 1),
          description: "Disposable local checkout benchmark fixture.",
          price: 1000,
          stock: 1000000,
          version: 0,
          category: "benchmark",
          images: [],
          slug,
          isActive: true,
        },
        update: {},
      });
      products.push(product);
      productIds.push(product.id);
      emails.push(email);
    }

    const hotSlug = "triad-perf-" + runId + "-hot-product";
    const hotProduct = await tx.product.upsert({
      where: { slug: hotSlug },
      create: {
        id: randomUUID(),
        name: "[PERF] Shared hot SKU",
        description: "Disposable shared-SKU contention benchmark fixture.",
        price: 1000,
        stock: 1000000,
        version: 0,
        category: "benchmark",
        images: [],
        slug: hotSlug,
        isActive: true,
      },
      update: {},
    });
    products.push(hotProduct);

    for (const product of products) {
      await tx.productCatalogProjection.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          category: product.category,
          images: product.images,
          slug: product.slug,
          isActive: product.isActive,
          avgRating: 0,
          reviewCount: 0,
          searchText: product.name,
          sourceVersion: product.version,
          createdAt: product.createdAt,
        },
        update: {},
      });
    }

    return { userCount: emails.length, hotProductId: hotProduct.id };
  }, { maxWait: 10000, timeout: 30000 });

  const hotProduct = await db.product.findUniqueOrThrow({
    where: { slug: "triad-perf-" + runId + "-hot-product" },
    select: { id: true },
  });
  return { runId, emails, productIds, hotProductId: hotProduct.id };
}

async function main() {
  readConfiguration(process.env);
  const db = new PrismaClient({ log: [] });
  try {
    const result = await seedBenchmarkFixtures(db);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Benchmark fixture seeding failed: " + error.message);
    process.exitCode = 1;
  });
}

module.exports = { readConfiguration, seedBenchmarkFixtures };
