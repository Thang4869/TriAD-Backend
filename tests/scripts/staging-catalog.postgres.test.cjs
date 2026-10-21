"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { Client } = require("pg");
const { PrismaClient } = require("@prisma/client");
const {
  seedStagingCatalog,
} = require("../../scripts/seed-staging-catalog.cjs");

const serverUrl = process.env.STAGING_CATALOG_TEST_SERVER_URL;
const enabled = {
  TRIAD_DEPLOYMENT_ENV: "staging",
  TRIAD_SEED_STAGING_CATALOG: "true",
};
const firstId = "5eb6bfc1-940a-4d16-8d86-7dc5f577f101";
const firstSlug = "staging-triad-storage-1000ml";

test(
  "catalog seed on disposable PostgreSQL",
  { skip: !serverUrl, timeout: 120000 },
  async (t) => {
    const url = new URL(serverUrl);
    assert.ok(["postgresql:", "postgres:"].includes(url.protocol));
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "Database tests require a loopback server",
    );
    assert.equal(
      url.pathname,
      "/triad_test",
      "Database tests require the disposable triad_test server",
    );
    // Do not permit pg host overrides to redirect the loopback-only test.
    assert.deepEqual(
      [...url.searchParams.keys()].filter((key) => key !== "schema"),
      [],
    );

    // Validate fixtures through the real HTTP schemas, not a duplicate regex.
    require("ts-node/register/transpile-only");
    const {
      addItemSchema,
      updateItemSchema,
    } = require("../../src/modules/cart/dto/cart.dto");
    const {
      getProductParamsSchema,
    } = require("../../src/modules/products/dto/products.dto");

    const admin = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 5000,
    });
    await admin.connect();
    let created = false;
    let db;
    let wrongDb;
    t.after(async () => {
      await db?.$disconnect();
      await wrongDb?.$disconnect();
      try {
        if (created) await admin.query('DROP DATABASE "triad_staging"');
      } finally {
        await admin.end();
      }
    });
    // Refuse to reuse any pre-existing database; cleanup owns only this creation.
    await admin.query('CREATE DATABASE "triad_staging"');
    created = true;
    wrongDb = new PrismaClient({
      datasources: { db: { url: url.toString() } },
    });
    url.pathname = "/triad_staging";
    url.search = "";
    const migration = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, DATABASE_URL: url.toString() },
        encoding: "utf8",
        timeout: 60000,
      },
    );
    assert.equal(
      migration.status,
      0,
      "Disposable database migrations must succeed",
    );
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    async function reset() {
      // Only this freshly created, loopback-only test database is ever truncated.
      await db.$executeRaw`TRUNCATE TABLE products, users, product_catalog_projection RESTART IDENTITY CASCADE`;
    }

    await t.test(
      "refuses the actual triad_test database before touching catalog tables",
      async () => {
        await assert.rejects(
          seedStagingCatalog(wrongDb, enabled),
          /connected database must be triad_staging/,
        );
      },
    );

    await t.test(
      "creates products and searchable public catalog projections together",
      async () => {
        await reset();
        assert.deepEqual(await seedStagingCatalog(db, enabled), {
          productsCreated: 3,
          projectionsCreated: 3,
        });
        const products = await db.product.findMany();
        assert.equal(products.length, 3);
        assert.equal(await db.productCatalogProjection.count(), 3);
        assert.equal(await db.user.count(), 0);
        for (const product of products) {
          const projection = await db.productCatalogProjection.findUnique({
            where: { productId: product.id },
          });
          assert.ok(product.name.startsWith("[STAGING]"));
          assert.ok(Number(product.price) > 0);
          assert.ok(product.stock > 0);
          assert.equal(
            getProductParamsSchema.safeParse({ params: { id: product.id } })
              .success,
            true,
          );
          assert.equal(
            addItemSchema.safeParse({
              body: { productId: product.id, quantity: 1 },
            }).success,
            true,
          );
          assert.equal(
            updateItemSchema.safeParse({
              params: { productId: product.id },
              body: { quantity: 0 },
            }).success,
            true,
          );
          assert.equal(projection.stock, product.stock);
          assert.equal(projection.price.toString(), product.price.toString());
          assert.equal(projection.sourceVersion, product.version);
          assert.equal(
            projection.searchText,
            `${product.name} ${product.description} ${product.category}`,
          );
        }
      },
    );

    await t.test(
      "reruns preserve edited fixtures, existing projections, users and orders",
      async () => {
        await reset();
        const user = await db.user.create({
          data: {
            email: "seed-test@example.invalid",
            firstName: "Seed",
            lastName: "Test",
          },
        });
        const other = await db.product.create({
          data: {
            name: "Existing product",
            price: 75000,
            stock: 6,
            category: "other",
            images: [],
            slug: "keep-existing-product",
          },
        });
        const order = await db.order.create({
          data: {
            orderNumber: "SEED-KEEP-1",
            userId: user.id,
            subtotal: 75000,
            tax: 0,
            shippingFee: 0,
            total: 75000,
            paymentMethod: "COD",
            customerName: "Seed Test",
            customerEmail: user.email,
            customerPhone: "0000000000",
            customerAddress: "Disposable database test",
            items: {
              create: {
                productId: other.id,
                quantity: 1,
                price: 75000,
                total: 75000,
              },
            },
          },
          include: { items: true },
        });
        await seedStagingCatalog(db, enabled);
        const edited = await db.product.update({
          where: { id: firstId },
          data: {
            name: "Edited fixture",
            stock: 2,
            price: 170000,
            version: 3,
            isActive: false,
          },
        });
        const projection = await db.productCatalogProjection.update({
          where: { productId: firstId },
          data: {
            name: edited.name,
            stock: edited.stock,
            price: edited.price,
            sourceVersion: 3,
            isActive: false,
          },
        });

        assert.deepEqual(await seedStagingCatalog(db, enabled), {
          productsCreated: 0,
          projectionsCreated: 0,
        });
        assert.deepEqual(
          await db.product.findUnique({ where: { id: firstId } }),
          edited,
        );
        assert.deepEqual(
          await db.productCatalogProjection.findUnique({
            where: { productId: firstId },
          }),
          projection,
        );
        assert.deepEqual(
          await db.product.findUnique({ where: { id: other.id } }),
          other,
        );
        assert.deepEqual(
          await db.user.findUnique({ where: { id: user.id } }),
          user,
        );
        assert.deepEqual(
          await db.order.findUnique({
            where: { id: order.id },
            include: { items: true },
          }),
          order,
        );
        assert.equal(await db.product.count(), 4);
        assert.equal(await db.productCatalogProjection.count(), 3);
      },
    );

    await t.test(
      "repairs a missing fixture projection using current stock, version and reviews",
      async () => {
        await reset();
        await seedStagingCatalog(db, enabled);
        const user = await db.user.create({
          data: {
            email: "review-test@example.invalid",
            firstName: "Review",
            lastName: "Test",
          },
        });
        await db.product.update({
          where: { id: firstId },
          data: { stock: 1, version: 4, price: 190000 },
        });
        await db.review.create({
          data: { productId: firstId, userId: user.id, rating: 4 },
        });
        await db.productCatalogProjection.delete({
          where: { productId: firstId },
        });

        assert.deepEqual(await seedStagingCatalog(db, enabled), {
          productsCreated: 0,
          projectionsCreated: 1,
        });
        const projection = await db.productCatalogProjection.findUnique({
          where: { productId: firstId },
        });
        assert.equal(projection.stock, 1);
        assert.equal(projection.price.toString(), "190000");
        assert.equal(projection.sourceVersion, 4);
        assert.equal(projection.avgRating, 4);
        assert.equal(projection.reviewCount, 1);
      },
    );

    await t.test(
      "product identifier conflicts roll back all new fixture writes",
      async () => {
        await reset();
        const existing = await db.product.create({
          data: {
            id: firstId,
            name: "Keep me",
            slug: "keep-my-slug",
            price: 50000,
            stock: 7,
            category: "other",
            images: [],
          },
        });
        await assert.rejects(
          seedStagingCatalog(db, enabled),
          /reserved product identifiers conflict/,
        );
        assert.deepEqual(await db.product.findMany(), [existing]);
        assert.equal(await db.productCatalogProjection.count(), 0);
      },
    );

    await t.test(
      "projection slug conflicts roll back products as well as partial projections",
      async () => {
        await reset();
        const existing = await db.product.create({
          data: {
            name: "Keep me",
            slug: "keep-existing",
            price: 50000,
            stock: 7,
            category: "other",
            images: [],
          },
        });
        const projection = await db.productCatalogProjection.create({
          data: {
            productId: existing.id,
            name: existing.name,
            slug: firstSlug,
            price: existing.price,
            stock: existing.stock,
            category: existing.category,
            images: [],
            isActive: true,
            searchText: existing.name,
          },
        });
        await assert.rejects(
          seedStagingCatalog(db, enabled),
          /reserved projection identifiers conflict/,
        );
        assert.deepEqual(await db.product.findMany(), [existing]);
        assert.deepEqual(await db.productCatalogProjection.findMany(), [
          projection,
        ]);
      },
    );

    await t.test(
      "concurrent seeds create exactly one copy of each product and projection",
      async () => {
        await reset();
        const results = await Promise.all([
          seedStagingCatalog(db, enabled),
          seedStagingCatalog(db, enabled),
        ]);
        assert.equal(
          results.reduce((sum, result) => sum + result.productsCreated, 0),
          3,
        );
        assert.equal(
          results.reduce((sum, result) => sum + result.projectionsCreated, 0),
          3,
        );
        assert.equal(await db.product.count(), 3);
        assert.equal(await db.productCatalogProjection.count(), 3);
      },
    );
  },
);
