import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

import { beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import { prisma } from "../src/core/database/prisma";
import redis from "../src/core/redis/client";
import { emailWorker, imageWorker } from "../src/core/queue/bull";

let testTransaction: any = null;

beforeAll(async () => {
  await prisma.$connect();
  await redis.ping();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
  await emailWorker.close();
  await imageWorker.close();
});

beforeEach(async () => {
});

afterEach(async () => {
  const tables = [
    "cart_items",
    "carts",
    "order_items",
    "orders",
    "reviews",
    "notifications",
    "refresh_tokens",
    "users",
    "products",
  ];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
});