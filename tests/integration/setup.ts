import { beforeAll, afterAll, afterEach, inject } from "vitest";
import { execSync } from "node:child_process";

type PrismaClientType =
  (typeof import("../../src/core/database/prisma"))["default"];
type RedisClientType =
  (typeof import("../../src/core/redis/client"))["default"];

let prisma: PrismaClientType;
let redis: RedisClientType;

beforeAll(async () => {
  // 1. Set env var TRƯỚC KHI prisma module được load
  const baseDatabaseUrl = inject("databaseUrl");
  const redisUrl = inject("redisUrl");

  const workerId = process.env.VITEST_WORKER_ID ?? "1";
  const schema = `test_w${workerId}`;
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set("schema", schema);

  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = redisUrl;
  process.env.QUEUE_REDIS_URL = redisUrl;

  // 2. Tạo schema rỗng
  const { PrismaClient } = await import("@prisma/client");
  const admin = new PrismaClient({
    datasources: { db: { url: baseDatabaseUrl } },
  });
  await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await admin.$disconnect();

  // 3. Push schema (db push nhanh hơn migrate deploy cho test)
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "inherit",
  });

  // 4. BÂY GIỜ mới import prisma — nó đọc env var đã set ở bước 1
  const prismaMod = await import("../../src/core/database/prisma");
  const redisMod = await import("../../src/core/redis/client");
  prisma = prismaMod.default;
  redis = redisMod.default;

  await prisma.$connect();
  await redis.ping?.();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "outbox_handler_log",
      "outbox_events",
      "wishlist_items",
      "cart_items",
      "carts",
      "order_items",
      "orders",
      "reviews",
      "notifications",
      "refresh_tokens",
      "discounts",
      "users",
      "products"
    RESTART IDENTITY CASCADE;
  `);
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  await redis?.quit?.();
  try {
    const { emailWorker, imageWorker } =
      await import("../../src/core/queue/bull");
    await emailWorker.close();
    await imageWorker.close();
  } catch {
    /* ignore */
  }
});

afterEach(async () => {
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "outbox_handler_log",
      "outbox_events",
      "wishlist_items",
      "cart_items",
      "carts",
      "order_items",
      "orders",
      "reviews",
      "notifications",
      "refresh_tokens",
      "discounts",
      "users",
      "products"
    RESTART IDENTITY CASCADE;
  `);
});
