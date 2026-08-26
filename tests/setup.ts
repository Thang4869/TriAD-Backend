import { beforeAll, afterAll, afterEach } from 'vitest';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

import prisma from '../src/core/database/prisma';
import redis from '../src/core/redis/client';
import { emailWorker, imageWorker } from '../src/core/queue/bull';

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

afterEach(async () => {
  const tables = [
    'cart_items',
    'carts',
    'order_items',
    'orders',
    'reviews',
    'notifications',
    'refresh_tokens',
    'users',
    'products',
  ];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
});