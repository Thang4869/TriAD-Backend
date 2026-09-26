import prisma from "@core/database/prisma";
import { redis } from "@core/redis/client";
import { imageQueue, emailQueue } from "@core/queue/bull";
import type { HealthCheckPort } from "./health-check.port";

export class InfrastructureHealthCheck implements HealthCheckPort {
  async checkDatabase(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }

  async checkCache(): Promise<void> {
    const pong = await redis.ping();

    if (pong !== "PONG") {
      throw new Error("Unexpected Redis ping response");
    }
  }

  async checkQueues(): Promise<void> {
    await Promise.all([imageQueue.client, emailQueue.client]);
  }
}
