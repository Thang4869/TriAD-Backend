"use strict";
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const Redis = require("ioredis");
const { Queue } = require("bullmq");

const IDS = {
  user: "10000000-0000-4000-8000-000000000143",
  pending: "20000000-0000-4000-8000-000000000143",
  product: "30000000-0000-4000-8000-000000000143",
  order: "40000000-0000-4000-8000-000000000143",
  event: "50000000-0000-4000-8000-000000000143",
};
const PASSWORD = "Disposable-Recovery-143!";
const EMAIL = "recovery-api@example.invalid";
const JOB = "recovery-persisted-job";

function assertFixture(mode, environment = process.env) {
  assert.equal(environment.RECOVERY_RUNTIME_ENABLED, "true");
  assert.match(
    environment.RECOVERY_PREFIX || "",
    /^triad-runtime-recovery-[0-9]+$/,
  );
  assert.ok(
    [
      "seed",
      "post-backup",
      "queue",
      "prepare",
      "verify",
      "source",
      "http",
    ].includes(mode),
  );
  const url = new URL(environment.DATABASE_URL);
  assert.equal(url.hostname, environment.RECOVERY_PREFIX + "-pg");
  assert.equal(url.port, "5432");
  assert.equal(url.username, "test");
  assert.equal(url.password, "test");
  assert.equal(url.search, "");
  const source = ["seed", "post-backup", "source"].includes(mode);
  assert.equal(
    url.pathname,
    source ? "/triad_recovery_source" : "/triad_recovery_target",
  );
  assert.equal(
    environment.REDIS_URL,
    "redis://" + environment.RECOVERY_PREFIX + "-redis:6379",
  );
}

async function main(mode) {
  assertFixture(mode);
  const db = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const queue = new Queue("email", { connection: redis });
  const commitTime = async (id) => {
    const rows =
      await db.$queryRaw`SELECT pg_xact_commit_timestamp(xmin) AS committed FROM recovery_drill_markers WHERE id = ${id}`;
    assert.ok(rows[0]?.committed instanceof Date);
    return rows[0].committed.toISOString();
  };
  const rebuild = async () => {
    const {
      rebuildOrderHistoryProjection,
    } = require("../../dist/core/outbox/rebuild-order-history-projection");
    const {
      rebuildProductCatalogProjection,
    } = require("../../dist/core/outbox/rebuild-product-catalog-projection");
    assert.equal(await rebuildOrderHistoryProjection(db), 1);
    assert.equal(await rebuildProductCatalogProjection(db), 1);
  };
  try {
    if (mode === "seed") {
      const password = await bcrypt.hash(PASSWORD, 10);
      await db.user.create({
        data: {
          id: IDS.user,
          email: EMAIL,
          password,
          firstName: "Recovery",
          lastName: "Fixture",
          isVerified: true,
        },
      });
      await db.user.create({
        data: {
          id: IDS.pending,
          email: "recovery-pending@example.invalid",
          password,
          firstName: "Pending",
          lastName: "Fixture",
          isVerified: false,
        },
      });
      await db.product.create({
        data: {
          id: IDS.product,
          name: "Recovery fixture",
          slug: "recovery-runtime-fixture",
          description: "CI synthetic product",
          category: "test",
          stock: 3,
          price: 1000,
          images: [],
        },
      });
      await db.order.create({
        data: {
          id: IDS.order,
          userId: IDS.user,
          orderNumber: "ORD-RECOVERY-143",
          total: 1000,
          subtotal: 1000,
          paymentMethod: "COD",
          customerName: "Recovery Fixture",
          customerEmail: EMAIL,
          customerPhone: "0000000000",
          customerAddress: "Disposable CI only",
          idempotencyKey: "recovery-durable-key",
          items: {
            create: {
              productId: IDS.product,
              quantity: 1,
              price: 1000,
              total: 1000,
            },
          },
        },
      });
      const occurredAt = new Date();
      await db.outboxEvent.create({
        data: {
          id: IDS.event,
          eventName: "UserRegistered",
          aggregateId: IDS.pending,
          occurredAt,
          payload: {
            schemaVersion: 1,
            eventName: "UserRegistered",
            aggregateId: IDS.pending,
            occurredAt: occurredAt.toISOString(),
            userId: IDS.pending,
            email: "recovery-pending@example.invalid",
            metadata: { email: "recovery-pending@example.invalid" },
          },
          attempts: 10,
          deadLetteredAt: occurredAt,
          lastError: "Synthetic pre-snapshot dead letter",
        },
      });
      await rebuild();
      await redis.set("recovery:aof-probe", "persisted");
      await queue.add(
        "recovery-persisted",
        {
          to: "persisted@example.invalid",
          subject: "Recovery fixture",
          template: "welcome",
          data: { name: "Synthetic" },
        },
        { jobId: JOB, removeOnComplete: false },
      );
      await db.$executeRawUnsafe(
        "CREATE TABLE recovery_drill_markers (id integer PRIMARY KEY)",
      );
      await db.$executeRaw`INSERT INTO recovery_drill_markers (id) VALUES (1)`;
      return { committedAt: await commitTime(1), marker: 1 };
    }
    if (mode === "post-backup") {
      await db.$executeRaw`INSERT INTO recovery_drill_markers (id) VALUES (2)`;
      return { committedAt: await commitTime(2), marker: 2 };
    }
    if (mode === "source") {
      const rows =
        await db.$queryRaw`SELECT id FROM recovery_drill_markers ORDER BY id`;
      assert.deepEqual(
        rows.map((x) => x.id),
        [1, 2],
      );
      return { sourcePreserved: true };
    }
    if (mode === "queue") {
      assert.equal(await redis.get("recovery:aof-probe"), "persisted");
      assert.equal(await (await queue.getJob(JOB)).getState(), "waiting");
      return { aofMarker: true, queuedJobSurvivedSigkill: true };
    }
    if (mode === "prepare") {
      const markers =
        await db.$queryRaw`SELECT id FROM recovery_drill_markers ORDER BY id`;
      assert.deepEqual(
        markers.map((x) => x.id),
        [1],
      );
      await db.orderHistoryProjection.deleteMany();
      await db.productCatalogProjection.deleteMany();
      await rebuild();
      const {
        OutboxMaintenanceService,
      } = require("../../dist/core/outbox/outbox-maintenance.service");
      const {
        PrismaOutboxMaintenanceStore,
      } = require("../../dist/core/outbox/prisma-outbox-maintenance.store");
      const runtimeDb = require("../../dist/core/database/prisma").default;
      try {
        const result = await new OutboxMaintenanceService(
          new PrismaOutboxMaintenanceStore(),
        ).replayDeadLetters([IDS.event]);
        assert.deepEqual(result.replayedIds, [IDS.event]);
      } finally {
        await runtimeDb.$disconnect();
      }
      return {
        snapshotBoundary: true,
        projectionsRebuilt: true,
        deadLetterRequeued: true,
      };
    }
    if (mode === "http") {
      const base = "http://" + process.env.RECOVERY_API_CONTAINER + ":3000";
      assert.ok(
        [
          process.env.RECOVERY_PREFIX + "-api",
          process.env.RECOVERY_PREFIX + "-rollback",
        ].includes(process.env.RECOVERY_API_CONTAINER),
      );
      const response = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "http://127.0.0.1:18000",
        },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers
        .getSetCookie()
        .find((x) => x.startsWith("accessToken="));
      assert.ok(cookie);
      const token = cookie.slice("accessToken=".length).split(";", 1)[0];
      const orders = await fetch(base + "/api/orders", {
        headers: { authorization: "Bearer " + token },
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(orders.status, 200);
      assert.equal((await orders.json()).data.orders[0].orderId, IDS.order);
      const products = await fetch(base + "/api/products", {
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(products.status, 200);
      assert.equal((await products.json()).data.products[0].id, IDS.product);
      return { authenticatedApi: true, catalog: true };
    }
    assert.equal(await db.order.count(), 1);
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: IDS.product } }))
        .stock,
      3,
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: IDS.order } }))
        .idempotencyKey,
      "recovery-durable-key",
    );
    const event = await db.outboxEvent.findUniqueOrThrow({
      where: { id: IDS.event },
    });
    assert.ok(event.publishedAt);
    assert.equal(event.deadLetteredAt, null);
    for (const handlerName of [
      "RegistrationVerificationHandler",
      "DashboardProjectionHandler:UserRegistered",
    ]) {
      assert.equal(
        await db.outboxHandlerLog.count({
          where: { outboxEventId: IDS.event, handlerName, status: "SUCCESS" },
        }),
        1,
      );
    }
    for (const jobId of [JOB, "registration-verification-" + IDS.pending]) {
      const job = await queue.getJob(jobId);
      assert.ok(job);
      assert.equal(await job.getState(), "completed");
    }
    const sink = await fetch(
      "http://" + process.env.RECOVERY_PREFIX + "-smtp:8025",
      { signal: AbortSignal.timeout(5000) },
    );
    assert.equal((await sink.json()).messages, 2);
    return {
      oneOrderAndStock: true,
      outboxPublished: true,
      workerJobsCompleted: 2,
      capturedMessages: 2,
    };
  } finally {
    await queue.close();
    await redis.quit();
    await db.$disconnect();
  }
}
if (require.main === module)
  main(process.argv[2])
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        "Recovery fixture failed in phase " +
          process.argv[2] +
          ": " +
          error.name,
      );
      process.exitCode = 1;
    });
module.exports = { assertFixture };
