import { beforeAll, afterAll, afterEach, inject } from "vitest";
import { execSync } from "node:child_process";

type PrismaClientType = (typeof import("@core/database/prisma"))["default"];
type RedisClientType = (typeof import("@core/redis/client"))["default"];

let prisma: PrismaClientType;
let redis: RedisClientType;

beforeAll(async () => {
  const baseDatabaseUrl = inject("databaseUrl");
  const redisUrl = inject("redisUrl");

  const workerId = process.env.VITEST_WORKER_ID ?? "1";
  const schema = `test_w${workerId}`;
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set("schema", schema);

  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = redisUrl;
  process.env.QUEUE_REDIS_URL = redisUrl;

  const { PrismaClient } = await import("@prisma/client");
  const adminClient = new PrismaClient({
    datasources: { db: { url: baseDatabaseUrl } },
  });
  await adminClient.$executeRawUnsafe(
    `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
  );
  await adminClient.$disconnect();

  execSync(`npx prisma db push --skip-generate --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "inherit",
  });

  const prismaMod = await import("@core/database/prisma");
  const redisMod = await import("@core/redis/client");
  prisma = prismaMod.default;
  redis = redisMod.default;

  await prisma.$connect();
  await redis.ping();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (redis) await redis.quit();
  try {
    const { emailWorker, imageWorker } = await import("@core/queue/bull");
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
      "outbox_handler_log", "outbox_events", "wishlist_items",
      "cart_items", "carts", "order_items", "orders", "reviews",
      "notifications", "refresh_tokens", "discounts", "users", "products"
    RESTART IDENTITY CASCADE;
  `);
});
