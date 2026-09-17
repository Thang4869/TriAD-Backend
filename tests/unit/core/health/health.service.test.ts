import { describe, it, expect, vi, beforeEach } from "vitest";
import { HealthService } from "@core/health/health.service";
import prisma from "@core/database/prisma";
import redis from "@core/redis/client";

vi.mock("@core/database/prisma", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("@core/redis/client", () => {
  const mockRedis = { ping: vi.fn().mockResolvedValue("PONG") };
  return {
    default: mockRedis,
    redis: mockRedis,
  };
});

vi.mock("@core/queue/bull", () => ({
  imageQueue: { client: { ping: vi.fn().mockResolvedValue("PONG") } },
  emailQueue: { client: { ping: vi.fn().mockResolvedValue("PONG") } },
}));
vi.mock("@core/logger/winston", () => ({ logger: { warn: vi.fn() } }));

describe("HealthService", () => {
  let service: HealthService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.ping).mockResolvedValue("PONG");
    service = new HealthService();
  });

  it("should check database successfully", async () => {
    const result = await service.checkDatabase();
    expect(result.status).toBe("up");
    expect(result.latencyMs).toBeDefined();
  });

  it("should handle database timeout", async () => {
    vi.mocked(prisma.$queryRaw).mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000),
        ) as any,
    );
    const result = await service.checkDatabase();
    expect(result.status).toBe("down");
    expect(result.error).toContain("Timed out after");
  });

  it("should report database down with 'Unknown error' when a non-Error value is thrown", async () => {
    vi.mocked(prisma.$queryRaw).mockImplementationOnce(
      () => Promise.reject("just a string, not an Error") as any,
    );
    const result = await service.checkDatabase();
    expect(result.status).toBe("down");
    expect(result.error).toBe("Unknown error");
  });

  it("should check redis successfully", async () => {
    vi.mocked(redis.ping).mockResolvedValue("PONG");
    const result = await service.checkRedis();
    expect(result.status).toBe("up");
  });

  it("should handle redis failure", async () => {
    vi.mocked(redis.ping).mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const result = await service.checkRedis();
    expect(result.status).toBe("down");
  });

  it("should mark redis down when ping responds with an unexpected value (not PONG)", async () => {
    vi.mocked(redis.ping).mockResolvedValueOnce("WEIRD" as any);
    const result = await service.checkRedis();
    expect(result.status).toBe("down");
    expect(result.error).toContain("Unexpected Redis ping response");
  });

  it("should check queues successfully", async () => {
    const result = await service.checkQueues();
    expect(result.status).toBe("up");
  });

  it("should mark queues down when a queue client connection rejects", async () => {
    const { imageQueue } = await import("@core/queue/bull");
    const originalClient = imageQueue.client;
    (imageQueue as any).client = Promise.reject(new Error("queue unreachable"));

    const result = await service.checkQueues();
    expect(result.status).toBe("down");

    (imageQueue as any).client = originalClient;
  });

  it("should return overall readiness", async () => {
    vi.mocked(redis.ping).mockResolvedValue("PONG");
    const report = await service.getReadiness();
    expect(report.status).toBe("up");
    expect(report.components).toHaveProperty("database");
    expect(report.components).toHaveProperty("cache");
    expect(report.components).toHaveProperty("queues");
  });

  it("should mark overall as down if any component down", async () => {
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("down"));
    const report = await service.getReadiness();
    expect(report.status).toBe("down");
  });
});
