import { beforeEach, describe, expect, it, vi } from "vitest";
import { InfrastructureHealthCheck } from "@core/health/infrastructure-health-check";
import prisma from "@core/database/prisma";
import { redis } from "@core/redis/client";

vi.mock("@core/database/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@core/redis/client", () => {
  const mockRedis = {
    ping: vi.fn(),
  };

  return {
    default: mockRedis,
    redis: mockRedis,
  };
});

vi.mock("@core/queue/bull", () => ({
  imageQueue: {
    client: Promise.resolve({}),
  },
  emailQueue: {
    client: Promise.resolve({}),
  },
}));

describe("InfrastructureHealthCheck", () => {
  let healthCheck: InfrastructureHealthCheck;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    vi.mocked(redis.ping).mockResolvedValue("PONG");

    healthCheck = new InfrastructureHealthCheck();
  });

  it("should check database successfully", async () => {
    await expect(healthCheck.checkDatabase()).resolves.toBeUndefined();

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("should check cache successfully when Redis responds with PONG", async () => {
    await expect(healthCheck.checkCache()).resolves.toBeUndefined();

    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it("should reject cache check when Redis response is unexpected", async () => {
    vi.mocked(redis.ping).mockResolvedValueOnce("WEIRD" as never);

    await expect(healthCheck.checkCache()).rejects.toThrow(
      "Unexpected Redis ping response",
    );
  });

  it("should check queues successfully", async () => {
    await expect(healthCheck.checkQueues()).resolves.toBeUndefined();
  });
});
