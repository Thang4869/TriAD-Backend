import { beforeAll, afterAll, afterEach, inject } from "vitest";
import { execSync } from "node:child_process";

const baseDatabaseUrl = inject("databaseUrl");
const redisUrl = inject("redisUrl");

// Mỗi worker dùng 1 schema riêng, tránh TRUNCATE chéo nhau
const workerId = process.env.VITEST_WORKER_ID ?? "1";
const schema = `test_w${workerId}`;

// DATABASE_URL phải có ?schema=<schema> để Prisma dùng đúng schema
const url = new URL(baseDatabaseUrl);
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.REDIS_URL = redisUrl;
process.env.QUEUE_REDIS_URL = redisUrl;

// Tạo schema trước khi Prisma kết nối
beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const adminClient = new PrismaClient({
    datasources: { db: { url: baseDatabaseUrl } },
  });
  await adminClient.$executeRawUnsafe(
    `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
  );
  await adminClient.$disconnect();

  // Migrate schema mới bằng prisma db push (nhanh hơn migrate deploy)
  execSync(`npx prisma db push --skip-generate --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "inherit",
  });
});

import prisma from "@core/database/prisma";
import redis from "@core/redis/client";

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
  try {
    const { emailWorker, imageWorker } = await import("@core/queue/bull");
    await emailWorker.close();
    await imageWorker.close();
  } catch {
    // ignore
  }
});

afterEach(async () => {
  // Chỉ TRUNCATE schema của worker này, không đụng worker khác
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
