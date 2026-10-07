import type {
  TraceAttributes,
  TraceAttributeSetter,
  TracerPort,
} from "@shared/application/observability/tracer.port";
import type { MetricsPort } from "@shared/application/observability/metrics.port";

export const noopTracer: TracerPort = {
  async withSpan<T>(
    _name: string,
    operation: (setAttributes: TraceAttributeSetter) => Promise<T>,
    _attributes?: TraceAttributes,
  ): Promise<T> {
    return operation(() => undefined);
  },
};

export const noopMetrics: MetricsPort = {
  increment(): void {
    // Intentionally empty test double.
  },
};
