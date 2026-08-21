import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

import { beforeAll, afterAll, afterEach } from "@jest/globals";
import { prisma } from "../src/core/database/prisma";
import redis from "../src/core/redis/client";

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

afterEach(async () => {
  const tables = [
    "CartItem",
    "Cart",
    "OrderItem",
    "Order",
    "Review",
    "Notification",
    "RefreshToken",
    "User",
    "Product",
  ];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
});
