import { describe, it, expect, vi, beforeEach } from "vitest";
import { HealthService } from "@core/health/health.service";
import type { HealthCheckPort } from "@core/health/health-check.port";

vi.mock("@core/logger/winston", () => ({ logger: { warn: vi.fn() } }));

describe("HealthService", () => {
  let service: HealthService;
  let healthCheck: HealthCheckPort;

  beforeEach(() => {
    vi.clearAllMocks();

    healthCheck = {
      checkDatabase: vi.fn().mockResolvedValue(undefined),
      checkCache: vi.fn().mockResolvedValue(undefined),
      checkQueues: vi.fn().mockResolvedValue(undefined),
    };

    service = new HealthService(healthCheck);
  });

  it("should check database successfully", async () => {
    const result = await service.checkDatabase();
    expect(result.status).toBe("up");
    expect(result.latencyMs).toBeDefined();
  });

  it("should handle database timeout", async () => {
    vi.mocked(healthCheck.checkDatabase).mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000),
        ),
    );
    const result = await service.checkDatabase();
    expect(result.status).toBe("down");
    expect(result.error).toContain("Timed out after");
  });

  it("should report database down with 'Unknown error' when a non-Error value is thrown", async () => {
    vi.mocked(healthCheck.checkDatabase).mockRejectedValueOnce(
      "just a string, not an Error",
    );
    const result = await service.checkDatabase();
    expect(result.status).toBe("down");
    expect(result.error).toBe("Unknown error");
  });

  it("should check redis successfully", async () => {
    const result = await service.checkRedis();

    expect(result.status).toBe("up");
    expect(healthCheck.checkCache).toHaveBeenCalledOnce();
  });

  it("should handle redis failure", async () => {
    vi.mocked(healthCheck.checkCache).mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const result = await service.checkRedis();
    expect(result.status).toBe("down");
  });

  it("should check queues successfully", async () => {
    const result = await service.checkQueues();
    expect(result.status).toBe("up");
  });

  it("should mark queues down when queue check fails", async () => {
    vi.mocked(healthCheck.checkQueues).mockRejectedValueOnce(
      new Error("queue unreachable"),
    );

    const result = await service.checkQueues();

    expect(result.status).toBe("down");
    expect(result.error).toBe("queue unreachable");
  });

  it("should return overall readiness", async () => {
    const report = await service.getReadiness();

    expect(report.status).toBe("up");
    expect(report.components).toHaveProperty("database");
    expect(report.components).toHaveProperty("cache");
    expect(report.components).toHaveProperty("queues");
  });

  it("should mark overall as down if any component down", async () => {
    vi.mocked(healthCheck.checkCache).mockRejectedValueOnce(new Error("down"));

    const report = await service.getReadiness();

    expect(report.status).toBe("down");
  });
});
