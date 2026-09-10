import { execSync } from "child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import type { TestProject } from "vitest/node";

let postgresContainer: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
let redisContainer: Awaited<ReturnType<RedisContainer["start"]>>;

export default async function setup({ provide }: TestProject) {
  postgresContainer = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("triad_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  redisContainer = await new RedisContainer("redis:7-alpine").start();

  const databaseUrl = postgresContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.QUEUE_REDIS_URL = redisUrl;
  process.env.NODE_ENV = "test";

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  provide("databaseUrl", databaseUrl);
  provide("redisUrl", redisUrl);

  return async () => {
    await redisContainer.stop();
    await postgresContainer.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}
