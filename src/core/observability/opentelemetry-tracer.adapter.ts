import type {
  TraceAttributes,
  TracerPort,
} from "@shared/application/observability/tracer.port";
import { withSpan } from "@core/tracing/span";

export class OpenTelemetryTracerAdapter implements TracerPort {
  withSpan<T>(
    name: string,
    operation: (
      setAttributes: (attributes: TraceAttributes) => void,
    ) => Promise<T>,
    attributes?: TraceAttributes,
  ): Promise<T> {
    return withSpan(name, operation, attributes);
  }
}
