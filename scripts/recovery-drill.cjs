"use strict";
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const IDS = Object.freeze({
  user: "i9-restore-user",
  product: "i9-restore-product",
  order: "i9-restore-order",
  event: "i9-restore-outbox",
  after: "i9-post-snapshot",
});

function assertSafeDatabase(url, mode) {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.RECOVERY_DRILL_ENABLED !== "true"
  ) {
    throw new Error(
      "Recovery drill requires NODE_ENV=test and RECOVERY_DRILL_ENABLED=true",
    );
  }
  if (!url) throw new Error("DATABASE_URL is required");
  const parsed = new URL(url);
  // Fail closed even when a production host reuses the disposable DB name.
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "5432" ||
    parsed.username !== "test" ||
    parsed.password !== "test" ||
    parsed.search !== ""
  ) {
    throw new Error(
      "Refusing recovery drill outside the isolated local CI PostgreSQL service",
    );
  }
  const database = parsed.pathname.slice(1);
  const expected =
    mode === "seed" || mode === "post-backup"
      ? "triad_recovery_source"
      : "triad_recovery_target";
  if (database !== expected) {
    throw new Error(
      "Refusing recovery drill against " + database + "; expected " + expected,
    );
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["seed", "post-backup", "verify", "verify-projections"].includes(mode)) {
    throw new Error(
      "Usage: node scripts/recovery-drill.cjs seed|post-backup|verify|verify-projections",
    );
  }
  assertSafeDatabase(process.env.DATABASE_URL, mode);
  const db = new PrismaClient();
  try {
    if (mode === "seed") {
      await db.user.create({
        data: {
          id: IDS.user,
          email: "restore-drill@example.invalid",
          firstName: "Recovery",
          lastName: "Drill",
          password: "not-a-real-hash",
          isVerified: true,
        },
      });
      await db.product.create({
        data: {
          id: IDS.product,
          name: "Recovery drill product",
          description: "Ephemeral CI fixture",
          slug: "recovery-drill-product",
          category: "recovery",
          price: "1000",
          stock: 3,
          images: [],
        },
      });
      await db.order.create({
        data: {
          id: IDS.order,
          userId: IDS.user,
          orderNumber: "I9-RECOVERY-ORDER",
          paymentMethod: "COD",
          subtotal: "1000",
          total: "1000",
          customerName: "Recovery Drill",
          customerEmail: "restore-drill@example.invalid",
          customerPhone: "0123456789",
          customerAddress: "CI-only address",
          idempotencyKey: "i9-retry-key",
          items: {
            create: {
              productId: IDS.product,
              quantity: 1,
              price: "1000",
              total: "1000",
            },
          },
        },
      });
      await db.outboxEvent.create({
        data: {
          id: IDS.event,
          eventName: "RecoveryDrillProbe",
          aggregateId: IDS.order,
          payload: { marker: "pre-backup-intent", version: 1 },
          occurredAt: new Date(),
        },
      });
      process.stdout.write("I9 source fixture created\n");
      return;
    }

    if (mode === "post-backup") {
      await db.outboxEvent.create({
        data: {
          id: IDS.after,
          eventName: "RecoveryDrillProbe",
          aggregateId: IDS.order,
          payload: { marker: "after-snapshot-write" },
          occurredAt: new Date(),
        },
      });
      return;
    }

    const [user, product, order, event, postBackup] = await Promise.all([
      db.user.findUnique({ where: { id: IDS.user } }),
      db.product.findUnique({ where: { id: IDS.product } }),
      db.order.findUnique({
        where: { id: IDS.order },
        include: { items: true },
      }),
      db.outboxEvent.findUnique({ where: { id: IDS.event } }),
      db.outboxEvent.findUnique({ where: { id: IDS.after } }),
    ]);
    assert.equal(user?.isVerified, true);
    assert.equal(product?.stock, 3);
    assert.equal(product?.price.toString(), "1000");
    assert.equal(order?.idempotencyKey, "i9-retry-key");
    assert.equal(order?.items.length, 1);
    assert.equal(order?.total.toString(), "1000");
    assert.equal(event?.publishedAt, null);
    assert.deepEqual(event?.payload, {
      marker: "pre-backup-intent",
      version: 1,
    });
    assert.equal(
      postBackup,
      null,
      "Snapshot must exclude writes after pg_dump",
    );
    if (mode === "verify-projections") {
      const [catalog, history] = await Promise.all([
        db.productCatalogProjection.findUnique({
          where: { productId: IDS.product },
        }),
        db.orderHistoryProjection.findUnique({ where: { orderId: IDS.order } }),
      ]);
      assert.equal(catalog?.stock, 3);
      assert.equal(history?.orderNumber, "I9-RECOVERY-ORDER");
      assert.equal(history?.total.toString(), "1000");
      assert.equal(history?.sourceVersion, order.version);
    }
    process.stdout.write("I9 restored fixture PASS: " + mode + "\n");
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      "Recovery drill failed: " + (error.stack || error) + "\n",
    );
    process.exitCode = 1;
  });
}
module.exports = { assertSafeDatabase };
