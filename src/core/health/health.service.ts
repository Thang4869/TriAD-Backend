import type { HealthCheckPort } from "./health-check.port";
import { logger } from "@core/logger/winston";

export type ComponentStatus = "up" | "down";

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
}

export interface ReadinessReport {
  status: ComponentStatus;
  timestamp: string;
  components: Record<string, ComponentHealth>;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

async function measure(
  check: () => Promise<unknown>,
  timeoutMs = 2000,
): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await withTimeout(check(), timeoutMs);
    return { status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("Health check component failed", { error: message });
    return { status: "down", latencyMs: Date.now() - start, error: message };
  }
}

export class HealthService {
  constructor(private readonly healthCheck: HealthCheckPort) {}
  async checkDatabase(): Promise<ComponentHealth> {
    return measure(() => this.healthCheck.checkDatabase());
  }

  async checkRedis(): Promise<ComponentHealth> {
    return measure(() => this.healthCheck.checkCache());
  }

  async checkQueues(): Promise<ComponentHealth> {
    return measure(() => this.healthCheck.checkQueues());
  }

  async getReadiness(): Promise<ReadinessReport> {
    const [database, cache, queues] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueues(),
    ]);

    const components = { database, cache, queues };
    const overallStatus: ComponentStatus = Object.values(components).every(
      (c) => c.status === "up",
    )
      ? "up"
      : "down";

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components,
    };
  }
}
